import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile, rm, realpath, lstat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { verifyInputs } from './scripts/inputs.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const args=process.argv.slice(2);
assert.equal(args.length,2,'usage: npm run build -- --inputs /absolute/path/inputs.json');assert.equal(args[0],'--inputs');
const inputs=await verifyInputs(path.resolve(args[1]));
const npm=process.env.npm_execpath;assert.ok(npm,'run this build through npm');
execFileSync(process.execPath,[npm,'install','--no-save','--package-lock=false','--ignore-scripts','--force','--no-audit','--no-fund',...inputs.packages.map(p=>p.file)],{cwd:root,stdio:'inherit'});
for(const input of inputs.packages) {
 const installed=path.join(root,'node_modules',...input.name.split('/'));
 assert.equal((await lstat(installed)).isSymbolicLink(),false,'workspace links are not build inputs');
 const manifest=JSON.parse(await readFile(path.join(installed,'package.json'),'utf8'));
 assert.equal(manifest.name,input.name);assert.equal(manifest.version,input.version);
 assert.ok((await realpath(installed)).startsWith(await realpath(path.join(root,'node_modules'))));
}
execFileSync(process.execPath,[path.join(root,'node_modules/typescript/bin/tsc'),'--noEmit'],{cwd:root,stdio:'inherit'});
const {getDistributionResources}=await import('@superbee/cli/resources');
const resources=getDistributionResources({packageName:'@superbee/windows-cli',binName:'superbee-windows'});
await rm(path.join(root,'dist'),{recursive:true,force:true});
await rm(path.join(root,'references'),{recursive:true,force:true});
await mkdir(path.join(root,'dist'),{recursive:true});
await writeFile(path.join(root,'SKILL.md'),resources.skill);
for(const entry of resources.references) {
 assert.equal(typeof entry.content,'string');assert.ok(entry.path.startsWith('references/'),'resource paths must be rooted under references/');
 assert.ok(!entry.path.includes('\\') && !entry.path.split('/').some(p=>!p||p==='.'||p==='..'),'resource escaped package');
 const file=path.join(root,entry.path);await mkdir(path.dirname(file),{recursive:true});await writeFile(file,entry.content);
}
let commit=null,dirty=true;
try { commit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(); dirty=execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim().length>0; } catch {}
const identity={schema:'superbee.build-identity.v1',package:{name:'@superbee/windows-cli',version:'0.0.0'},source:{commit,dirty},artifact:{channel:'local-dev'},compatibility_contracts:{skill:1,hook:1,mcp:1}};
const result=await build({absWorkingDir:root,entryPoints:['src/index.ts'],outfile:'dist/superbee-windows.mjs',bundle:true,platform:'node',format:'esm',target:'node20',metafile:true,
 banner:{js:"import { createRequire as ___windowsCreateRequire } from 'node:module';\nconst require=___windowsCreateRequire(import.meta.url);"},
 define:{WINDOWS_BUILD_IDENTITY:JSON.stringify(identity)}});
await build({absWorkingDir:root,entryPoints:['src/filesystem.ts'],outfile:'dist/filesystem.mjs',bundle:true,platform:'node',format:'esm',target:'node20',metafile:true}).then(async result=>{
 assert.ok(Object.keys(result.metafile.inputs).every(file=>file==='src/filesystem.ts'),'filesystem-only graph must not include CLI or command startup');
});
for(const input of Object.keys(result.metafile.inputs)) {
 if(input==='<define:WINDOWS_BUILD_IDENTITY>') continue;
 assert.ok(!path.isAbsolute(input) && !input.split(/[\\/]/).includes('..'),`outside source in bundle: ${input}`);
 assert.ok(input.startsWith('src/') || input.startsWith('node_modules/@superbee/cli/dist/'),`unexpected input ${input}`);
}
for(const output of Object.values(result.metafile.outputs)) for(const imported of output.imports) assert.ok(imported.path.startsWith('node:'),`runtime external dependency ${imported.path}`);
await writeFile(path.join(root,'dist/filesystem.d.ts'),`import type { FilesystemHostPolicy } from '@superbee/core/filesystem';\nexport declare function createWindowsFilesystemHostPolicy(input?: {home?: () => string; username?: () => string}): FilesystemHostPolicy;\nexport declare const windowsFilesystemHostPolicy: FilesystemHostPolicy;\n`);
await mkdir(path.join(root,'out'),{recursive:true});
await writeFile(path.join(root,'out/build-inputs.json'),JSON.stringify({inputs,identity,graph:result.metafile},null,2)+'\n');
