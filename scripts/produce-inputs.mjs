import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { sha256, upstreamRepository } from './inputs.mjs';
const [sourceArg,outArg]=process.argv.slice(2);
assert.ok(sourceArg&&outArg,'usage: node scripts/produce-inputs.mjs <source-checkout> <out-directory>');
const source=path.resolve(sourceArg),out=path.resolve(outArg);
const pin=JSON.parse(await readFile(new URL('../upstream-input.json',import.meta.url),'utf8'));
assert.match(pin.commit ?? '',/^[a-f0-9]{40}$/,'pinned upstream commit is required');
const git=(...args)=>execFileSync('git',args,{cwd:source,encoding:'utf8'}).trim();
assert.equal(git('rev-parse','HEAD'),pin.commit);
assert.equal(git('status','--porcelain'),'','producer requires a clean pinned source checkout');
const npm=process.env.npm_execpath;
assert.ok(npm,'run input production through npm exec');
const runNpm=args=>execFileSync(process.execPath,[npm,...args],{cwd:source,encoding:'utf8',maxBuffer:32*1024*1024});
await mkdir(out,{recursive:true});
runNpm(['run','check:package-versions']);
runNpm(['ci','--ignore-scripts','--no-audit','--no-fund']);
runNpm(['run','build']);
const packages=[];
for(const name of ['@superbee/cli','@superbee/core']) {
  const receipts=JSON.parse(runNpm(['pack','-w',name,'--ignore-scripts','--json','--pack-destination',out]));
  assert.equal(receipts.length,1);const receipt=receipts[0];assert.equal(receipt.name,name);
  packages.push({name,version:receipt.version,filename:receipt.filename,sha256:sha256(await readFile(path.join(out,receipt.filename)))});
}
const record={repository:upstreamRepository,commit:pin.commit,lockfileSha256:sha256(await readFile(path.join(source,'package-lock.json'))),node:process.version,npm:runNpm(['--version']).trim(),packages};
const body=JSON.stringify(record,null,2)+'\n';await writeFile(path.join(out,'inputs.json'),body);
process.stdout.write(JSON.stringify({recordSha256:sha256(Buffer.from(body)),packages})+'\n');
