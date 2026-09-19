import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runTests } from '../scripts/run-tests.mjs';

test('npm test uses explicit discovery with the current Node and existing registration',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
 assert.equal(manifest.scripts.test,'node scripts/run-tests.mjs');
 let seen=false;
 assert.equal(await runTests(undefined,(executable,args,options)=>{
  seen=true;assert.equal(executable,process.execPath);
  assert.deepEqual(args.slice(0,3),['--test','--import','./test/register.mjs']);
  assert.ok(args.includes('test/registry.test.mjs'));assert.ok(args.includes('test/command.test.ts'));
  assert.ok(args.every(arg=>!arg.includes('*')));assert.equal(options.shell,undefined);
  return {status:0};
 }),0);assert.equal(seen,true);
});

test('discovered test paths work with spaces and real child failures remain failures',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'windows test runner '));
 try {
  await mkdir(path.join(dir,'test'));await writeFile(path.join(dir,'test/register.mjs'),'');
  await writeFile(path.join(dir,'test/helper.mjs'),"throw Error('helper must not execute');");
  await mkdir(path.join(dir,'test/directory.test.mjs'));
  const filename=path.join(dir,'test/file with spaces.test.mjs');
  await writeFile(filename,"import test from 'node:test'; test('fixture',()=>{});");
  // A fresh shell does not inherit Node's internal child-test IPC context.
  const childEnv={...process.env};delete childEnv.NODE_TEST_CONTEXT;
  const actual=(exe,args,options)=>spawnSync(exe,args,{...options,stdio:'pipe',env:childEnv});
  assert.equal(await runTests(dir,actual),0);
  await writeFile(filename,"import test from 'node:test'; test('fixture',()=>{throw Error('expected red');});");
  assert.equal(await runTests(dir,actual),1);
 }finally{await rm(dir,{recursive:true,force:true});}
});
