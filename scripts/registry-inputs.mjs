import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir, lstat, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { t } from 'tar';
import { sha256, verifyInputs } from './inputs.mjs';
import { validateEmbeddedEngine, verifyProvenance } from './provenance.mjs';
import { root, readLockedPackages } from './registry-lock.mjs';
export { root, names, exactVersion, validatePackage, validateLockedPackages, readLockedPackages } from './registry-lock.mjs';
export function verifyIntegrity(bytes,integrity) {assert.equal('sha512-'+createHash('sha512').update(bytes).digest('base64'),integrity,'tarball integrity mismatch');}
export async function fetchBytes(url,limit=32*1024*1024) {
 const response=await fetch(url,{signal:AbortSignal.timeout(60_000),redirect:'error',headers:{Accept:'application/vnd.github+json','User-Agent':'superbee-windows-registry-build'}});
 assert.ok(response.ok,`download failed: ${response.status} ${url}`);
 const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.length;assert.ok(size<=limit,'download exceeds byte limit');chunks.push(chunk);}
 return Buffer.concat(chunks);
}
export function validateArchivePath(value) {
 assert.equal(typeof value,'string');assert.ok(value.startsWith('package/'),'archive outside package root');
 const relative=value.slice(8).replace(/\/$/,'');assert.ok(relative,'empty archive path');
 for(const part of relative.split('/')) {
 assert.ok(part && part!=='.' && part!=='..' && !/[\\:\x00-\x1f<>"|?*]/.test(part),'unsafe archive path');
 assert.ok(!/[. ]$/.test(part) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part),'Windows path alias');
 }
 return relative;
}
export async function archiveInventory(file) {
 const files=new Map(),seen=new Set(),pending=[];let failure,total=0,count=0;
 await t({file,strict:true,onReadEntry(entry){
  try {
   assert.ok(['File','Directory'].includes(entry.type),'archive links and special entries refused');
   if(entry.path==='package/' && entry.type==='Directory'){entry.resume();return;}
   const name=validateArchivePath(entry.path),key=name.normalize('NFC').toLowerCase();
   assert.ok(!seen.has(key),'duplicate or aliased archive path');seen.add(key);
   total+=entry.size;count++;assert.ok(entry.size<=32*1024*1024 && total<=64*1024*1024 && count<=10000,'oversized archive inventory');
   if(entry.type==='Directory'){entry.resume();return;}
   pending.push(new Promise((resolve,reject)=>{const chunks=[];entry.on('data',b=>chunks.push(b));entry.on('error',reject);entry.on('end',()=>{files.set(name,Buffer.concat(chunks));resolve();});}));
  }catch(error){failure??=error;entry.resume();}
 }});
 await Promise.all(pending);if(failure)throw failure;
 assert.ok(files.has('package.json'),'archive manifest missing');return files;
}
export async function verifyInstalledTree(directory,expected) {
 assert.ok((await lstat(directory)).isDirectory() && !(await lstat(directory)).isSymbolicLink(),'installed package must be regular directory, not link');
 const actual=new Map(),seen=new Set();
 async function walk(dir,prefix='') {for(const entry of await readdir(dir,{withFileTypes:true})) {
  const relative=prefix+entry.name;const stat=await lstat(path.join(dir,entry.name));
  assert.ok(!stat.isSymbolicLink(),'installed descendant link refused');
  // These published packages are self-contained; nested topology would add unverified bytes.
  assert.ok(entry.name!=='node_modules','unexpected nested dependency topology');
  validateArchivePath('package/'+relative);const key=relative.normalize('NFC').toLowerCase();assert.ok(!seen.has(key),'installed path collision');seen.add(key);
  if(stat.isDirectory())await walk(path.join(dir,entry.name),relative+'/');else {assert.ok(stat.isFile(),'installed entry must be regular file');actual.set(relative,await readFile(path.join(dir,entry.name)));}
 }}
 await walk(directory);assert.deepEqual([...actual.keys()].sort(),[...expected.keys()].sort(),'installed inventory differs from verified tarball');
 for(const [name,bytes] of expected)assert.ok(actual.get(name).equals(bytes),`installed bytes changed: ${name}`);
}
export async function verifyInstalledInputs(inputs,directory=root) {
 const inventories=new Map();
 for(const relative of ['node_modules','node_modules/@superbee']) {
  const directoryPath=path.join(directory,relative),stat=await lstat(directoryPath);
  assert.ok(stat.isDirectory() && !stat.isSymbolicLink(),'installed dependency ancestors must be regular directories');
 }
 const installedRoot=await realpath(path.join(directory,'node_modules'));

 for(const pkg of inputs.packages){const installed=path.join(directory,'node_modules',...pkg.name.split('/'));
 assert.ok((await realpath(installed)).startsWith(installedRoot+path.sep),'installed package escapes dependency root');
 const inventory=await archiveInventory(pkg.file);const manifest=JSON.parse(inventory.get('package.json'));
 assert.equal(manifest.name,pkg.name);assert.equal(manifest.version,pkg.version);
 await verifyInstalledTree(installed,inventory);inventories.set(pkg.name,inventory);}
 const core=inputs.packages.find(p=>p.name==='@superbee/core');
 const record=JSON.parse(inventories.get('@superbee/cli').get('dist/embedded-engine.json'));
 validateEmbeddedEngine(record,core.version,inputs.provenance.commit);return record;
}
export async function acquireInputs(output=path.join(root,'inputs'),directory=root) {
 const locked=await readLockedPackages(directory);await mkdir(output,{recursive:true});const packages=[];
 for(const pkg of locked.packages){const bytes=await fetchBytes(pkg.resolved);verifyIntegrity(bytes,pkg.integrity);const filename=pkg.name.split('/')[1]+'.tgz';await writeFile(path.join(output,filename),bytes);packages.push({...pkg,filename,sha256:sha256(bytes)});}
 const cli=packages.find(p=>p.name==='@superbee/cli');
 const response=JSON.parse(await fetchBytes(`https://api.github.com/repos/Holaxis-ai/superbee/attestations/sha256:${cli.sha256}`));
 assert.ok(Array.isArray(response.attestations) && response.attestations.length,'release attestation missing');
 let bundle,provenance,lastError;for(const row of response.attestations){try {provenance=await verifyProvenance(row.bundle,cli.version,cli.sha256,path.join(output,'tuf-cache'));bundle=row.bundle;break;}catch(error){lastError=error;}}
 if(!bundle)throw lastError ?? Error('no trusted release attestation');
 const evidence=Buffer.from(JSON.stringify(bundle)+'\n');await writeFile(path.join(output,'provenance.json'),evidence);
 const record={schema:'superbee.registry-inputs.v1',...locked,packages,node:process.version,npm:execFileSync(process.execPath,[process.env.npm_execpath,'--version'],{encoding:'utf8'}).trim(),attestation:{filename:'provenance.json',sha256:sha256(evidence)},provenance};
 const recordPath=path.join(output,'inputs.json');await writeFile(recordPath,JSON.stringify(record,null,2)+'\n');
 return {recordPath,recordSha256:sha256(await readFile(recordPath))};
}
if(process.argv[1] && import.meta.url===pathToFileURL(await realpath(process.argv[1])).href){
 const result=await acquireInputs(path.resolve(process.argv[2] ?? 'inputs'));await verifyInputs(result.recordPath);console.log(JSON.stringify(result));
}
