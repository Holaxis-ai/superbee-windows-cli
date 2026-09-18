import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { validateInputRecord, verifyInputs, sha256 } from '../scripts/inputs.mjs';
const commit='1'.repeat(40);
const record={repository:'Holaxis-ai/superbee',commit,lockfileSha256:'2'.repeat(64),node:'v22.14.0',npm:'11.15.0',packages:[{name:'@superbee/cli',version:'0.0.0',filename:'cli.tgz',sha256:sha256(Buffer.from('cli'))},{name:'@superbee/core',version:'0.2.0-pre.4',filename:'core.tgz',sha256:sha256(Buffer.from('core'))}]};
test('artifact inputs reject missing pins, wrong sources, duplicates and path escapes',()=>{
 assert.equal(validateInputRecord(record,{commit}),record);
 for(const mutated of [{...record,commit:'main'},{...record,repository:'other/repo'},{...record,packages:[record.packages[0],record.packages[0]]},{...record,packages:[{...record.packages[0],filename:'../cli.tgz'},record.packages[1]]}]) assert.throws(()=>validateInputRecord(mutated,{commit}));
 assert.throws(()=>validateInputRecord(record,{commit:null}),/pinned/);
 assert.throws(()=>validateInputRecord(record,{commit:'3'.repeat(40)}),/differs/);
});
test('artifact input verification rejects changed tarball bytes',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'windows-input-test-'));
 try {
  await writeFile(path.join(root,'inputs.json'),JSON.stringify(record));await writeFile(path.join(root,'pin.json'),JSON.stringify({commit}));
  await writeFile(path.join(root,'cli.tgz'),'cli');await writeFile(path.join(root,'core.tgz'),'core');
  await verifyInputs(path.join(root,'inputs.json'),path.join(root,'pin.json'));
  await writeFile(path.join(root,'cli.tgz'),'changed');
  await assert.rejects(verifyInputs(path.join(root,'inputs.json'),path.join(root,'pin.json')),/bytes changed/);
 } finally {await rm(root,{recursive:true,force:true});}
});
