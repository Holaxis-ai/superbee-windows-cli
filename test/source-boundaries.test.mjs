import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {mkdtemp,mkdir,readFile,writeFile,copyFile,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import test from 'node:test';
import {isMain} from '../scripts/is-main.mjs';
import {fetchBytes} from '../scripts/registry-inputs.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));

test('autocrlf clone preserves reviewed proof, workflows and README bytes',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'autocrlf-proof-'));try{
 const source=path.join(dir,'source'),clone=path.join(dir,'clone');await mkdir(source);
 const files=['.gitattributes','README.md','.github/workflows/ci.yml','.github/workflows/upstream-drift.yml','scripts/windows-installed-package-proof.mjs','test/native-proof.json'];
 for(const file of files){await mkdir(path.dirname(path.join(source,file)),{recursive:true});await copyFile(path.join(root,file),path.join(source,file));}
 const git=args=>{const result=spawnSync('git',args,{cwd:source,encoding:'utf8'});assert.equal(result.status,0,result.stderr);};
 git(['init']);git(['-c','core.autocrlf=false','add','.']);git(['-c','user.name=Test','-c','user.email=test@example.invalid','-c','commit.gpgsign=false','commit','-m','fixture']);
 git(['-c','core.autocrlf=true','clone','--no-local','--config','core.autocrlf=true',source,clone]);
 for(const file of files)assert.deepEqual(await readFile(path.join(clone,file)),await readFile(path.join(root,file)),file);
 const bytes=await readFile(path.join(clone,'scripts/windows-installed-package-proof.mjs'));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),JSON.parse(await readFile(path.join(root,'test/native-proof.json'))).sha256);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('entrypoint aliases execute the dependency-free report instead of silently succeeding',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'entrypoint-alias-'));try{
 const actual=path.join(dir,'actual'),alias=path.join(dir,'alias');await mkdir(path.join(actual,'scripts'),{recursive:true});
 for(const file of ['upstream-drift.mjs','registry-lock.mjs','is-main.mjs'])await copyFile(path.join(root,'scripts',file),path.join(actual,'scripts',file));
 await symlink(actual,alias,'junction');const script=path.join(alias,'scripts/upstream-drift.mjs');
 assert.equal(await isMain(pathToFileURL(script).href,path.join(actual,'scripts/upstream-drift.mjs')),true);
 assert.equal(await isMain(pathToFileURL(script).href,path.join(actual,'scripts/registry-lock.mjs')),false);
 const result=spawnSync(process.execPath,['--preserve-symlinks-main',script,'report'],{encoding:'utf8',env:{...process.env,OLD_PAIR:'',CANDIDATE_PAIR:'',INPUTS_RESULT:'failure',CONSUMER_RESULT:'skipped'}});
 assert.equal(result.status,1,result.stderr);assert.match(result.stdout,/Resolution missing or invalid/);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('metadata and tarball requests use generic Accept; only GitHub API uses vendor Accept',async()=>{
 for(const [url,accept] of [['https://registry.npmjs.org/@superbee/cli/next','*/*'],['https://registry.npmjs.org/@superbee/cli/-/cli-0.1.0-pre.1.tgz','*/*'],['https://api.github.com/repos/Holaxis-ai/superbee/attestations/sha256:abc','application/vnd.github+json']]) {
 let calls=0;const bytes=await fetchBytes(url,10,async (actual,options)=>{calls++;assert.equal(actual,url);assert.equal(options.headers.Accept,accept);assert.equal(options.redirect,'error');assert.ok(options.signal);return new Response('ok');});
 assert.equal(calls,1);assert.equal(bytes.toString(),'ok');
 }
});
