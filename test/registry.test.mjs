import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { validateLockedPackages, verifyInstalledTree, validateArchivePath } from '../scripts/registry-inputs.mjs';
import { validateStatement, validateEmbeddedEngine } from '../scripts/provenance.mjs';
const names=['@superbee/cli','@superbee/core'];
const manifest={devDependencies:Object.fromEntries(names.map(n=>[n,'1.2.3']))};
const lock={packages:{'':manifest,...Object.fromEntries(names.map(n=>['node_modules/'+n,{version:'1.2.3',resolved:`https://registry.npmjs.org/${n}/-/${n.split('/')[1]}-1.2.3.tgz`,integrity:'sha512-'+Buffer.alloc(64).toString('base64')}]))}};
test('registry identity rejects mutable versions, wrong registry and missing integrity',()=>{
 assert.equal(validateLockedPackages(manifest,lock).length,2);
 for(const mutate of [m=>m.devDependencies[names[0]]='next',m=>m.devDependencies[names[0]]='^1.2.3']) {const m=structuredClone(manifest);mutate(m);assert.throws(()=>validateLockedPackages(m,lock));}
 for(const mutate of [l=>delete l.packages['node_modules/'+names[0]].integrity,l=>l.packages['node_modules/'+names[0]].resolved='https://evil.test/cli.tgz',l=>l.packages[''].devDependencies[names[0]]='1.2.4']) {const l=structuredClone(lock);mutate(l);assert.throws(()=>validateLockedPackages(manifest,l));}
});
test('archive paths reject traversal, Windows aliases, links via tree gate',async()=>{
 for(const p of ['../bad','package/../bad','package/a\\b','package/C:foo','package/CON','package/file.','package/a//b']) assert.throws(()=>validateArchivePath(p));
 assert.equal(validateArchivePath('package/dist/main.js'),'dist/main.js');
 const root=await mkdtemp(path.join(tmpdir(),'registry-tree-'));try {
 await mkdir(path.join(root,'dist'));await writeFile(path.join(root,'dist/a.js'),'safe');
 const expected=new Map([['dist/a.js',Buffer.from('safe')]]);
 await verifyInstalledTree(root,expected);
 await writeFile(path.join(root,'dist/a.js'),'changed');await assert.rejects(verifyInstalledTree(root,expected),/bytes/);
 await writeFile(path.join(root,'dist/a.js'),'safe');await writeFile(path.join(root,'extra.js'),'extra');await assert.rejects(verifyInstalledTree(root,expected),/inventory/);
 await rm(path.join(root,'extra.js'));await rm(path.join(root,'dist/a.js'));await symlink(path.join(root,'outside'),path.join(root,'dist/a.js'));await assert.rejects(verifyInstalledTree(root,expected),/regular|link/);
 } finally {await rm(root,{recursive:true,force:true});}
});
test('embedded identity requires v2, one matching core, clean signed source',()=>{
 const record={schema:'superbee.cli-embedded-engine.v2',source:{commit:'a'.repeat(40),dirty:false},packages:[{name:'@superbee/core',version:'1.2.3',release_tag:'libraries/v1.2.3'}]};
 validateEmbeddedEngine(record,'1.2.3','a'.repeat(40));
 for(const mutate of [r=>r.schema='v1',r=>r.source.dirty=true,r=>r.source.commit='b'.repeat(40),r=>r.packages.push(r.packages[0]),r=>r.packages[0].version='1.2.4',r=>r.packages[0].release_tag='main']) {const r=structuredClone(record);mutate(r);assert.throws(()=>validateEmbeddedEngine(r,'1.2.3','a'.repeat(40)));}
});

test('actual signed release statement requires subject, workflow, tag and immutable source',async()=>{
 const {readFile}=await import('node:fs/promises');
 const bundle=JSON.parse(await readFile(new URL('./fixtures/cli-release-provenance.json',import.meta.url),'utf8'));
 const digest='866f5c912ec146e74a3341d969426665f28cfc18770db178aaa702a75c83e81f';
 const source=validateStatement(bundle,'0.1.0-pre.1',digest);assert.equal(source.commit,'4c8e78c1e9a9fa769e5b3e8ef687d3bfc2df87ed');
 for(const mutate of [s=>s.subject[0].digest.sha256='0'.repeat(64),s=>s.subject.push(s.subject[0]),s=>s.predicate.buildDefinition.externalParameters.workflow.path='evil.yml',s=>s.predicate.buildDefinition.externalParameters.workflow.ref='refs/heads/main',s=>s.predicate.runDetails.builder.id='other',s=>s.predicate.buildDefinition.resolvedDependencies[0].digest.gitCommit='main']){
 const changed=structuredClone(bundle),statement=JSON.parse(Buffer.from(changed.dsseEnvelope.payload,'base64'));mutate(statement);changed.dsseEnvelope.payload=Buffer.from(JSON.stringify(statement)).toString('base64');assert.throws(()=>validateStatement(changed,'0.1.0-pre.1',digest));
 }
});

test('archive reader rejects duplicate names, Windows collisions and symlink members',async()=>{
 const {c}=await import('tar');const {archiveInventory}=await import('../scripts/registry-inputs.mjs');
 const dir=await mkdtemp(path.join(tmpdir(),'registry-archive-'));try{
 await mkdir(path.join(dir,'package'));await writeFile(path.join(dir,'package/package.json'),'{}');await writeFile(path.join(dir,'package/a'),'ok');
 const file=path.join(dir,'input.tgz');await c({cwd:dir,file,gzip:true},['package/package.json','package/a']);assert.equal((await archiveInventory(file)).get('a').toString(),'ok');
 await c({cwd:dir,file,gzip:true},['package/package.json','package/a','package/a']);await assert.rejects(archiveInventory(file),/duplicate/);
 await writeFile(path.join(dir,'package/A'),'different');await c({cwd:dir,file,gzip:true},['package/package.json','package/a','package/A']);await assert.rejects(archiveInventory(file),/aliased/);
 await symlink('a',path.join(dir,'package/link'));await c({cwd:dir,file,gzip:true},['package/package.json','package/link']);await assert.rejects(archiveInventory(file),/links/);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('build failure invalidates previous executable and proof receipts before reading inputs',async()=>{
 const {cp,readFile,access}=await import('node:fs/promises');const {spawnSync}=await import('node:child_process');const {fileURLToPath}=await import('node:url');
 const dir=await mkdtemp(path.join(tmpdir(),'registry-build-failure-'));try{
 const source=fileURLToPath(new URL('..',import.meta.url));
 await cp(path.join(source,'build.mjs'),path.join(dir,'build.mjs'));await cp(path.join(source,'scripts'),path.join(dir,'scripts'),{recursive:true});
 await writeFile(path.join(dir,'package.json'),'{"type":"module"}');await symlink(path.join(source,'node_modules'),path.join(dir,'node_modules'),'junction');
 await mkdir(path.join(dir,'dist'));await mkdir(path.join(dir,'out'));await writeFile(path.join(dir,'dist/superbee-windows.mjs'),'stale');await writeFile(path.join(dir,'out/package-proof.json'),'stale');
 const result=spawnSync(process.execPath,[path.join(dir,'build.mjs'),'--inputs',path.join(dir,'missing.json')],{encoding:'utf8'});
 assert.notEqual(result.status,0);assert.match(result.stderr,/missing.json/);
 await assert.rejects(access(path.join(dir,'dist')));await assert.rejects(access(path.join(dir,'out')));
 }finally{await rm(dir,{recursive:true,force:true});}
});
