import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { extractReadmeBuild } from '../scripts/extract-readme-build.mjs';
const readme=await readFile(new URL('../README.md',import.meta.url),'utf8');
test('README build bytes are extracted verbatim and every native exit propagates',()=>{
 const block=extractReadmeBuild(readme);assert.ok(readme.includes(block));
 const commands=['npm ci','npm run build','npm run verify:package'];
 for(const command of commands) assert.ok(block.includes(command+'\nif ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }\n'));
 assert.notEqual(extractReadmeBuild(readme.replace('npm run build','npm run different')),block);
 for(const bad of [readme.replace('windows-build:start','missing'),readme.replace('```powershell','```sh'),readme+ '\n<!-- windows-build:start -->',readme.replace('windows-build:end','missing')]) assert.throws(()=>extractReadmeBuild(bad));
});
test('Windows executes exact README block fail-fast when first native command fails',{skip:process.platform!=='win32'},async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'readme-fail-fast-'));
 try {
 await writeFile(path.join(dir,'npm.cmd'),'@echo off\r\necho invoked>>"%~dp0calls.txt"\r\nexit /b 19\r\n');
 const script=path.join(dir,'build.ps1');await writeFile(script,extractReadmeBuild(readme));
 const result=spawnSync('pwsh',['-NoProfile','-File',script],{env:{...process.env,PATH:dir+path.delimiter+process.env.PATH},encoding:'utf8'});
 assert.equal(result.status,19,result.stderr);assert.equal((await readFile(path.join(dir,'calls.txt'),'utf8')).trim().split(/\r?\n/).length,1);
 }finally{await rm(dir,{recursive:true,force:true});}
});
