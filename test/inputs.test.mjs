import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { validateInputRecord, verifyInputs, sha256 } from '../scripts/inputs.mjs';
import { readLockedPackages } from '../scripts/registry-inputs.mjs';
const locked=await readLockedPackages();
const record={schema:'superbee.registry-inputs.v1',...locked,node:'v22.14.0',npm:'11.15.0',attestation:{filename:'provenance.json',sha256:'a'.repeat(64)},packages:locked.packages.map((p,i)=>({...p,filename:i?'core.tgz':'cli.tgz',sha256:sha256(Buffer.from(p.name))}))};
test('registry records reject wrong lock, legacy source, duplicate packages and path escapes',()=>{
 assert.equal(validateInputRecord(record,locked),record);
 for(const bad of [{...record,schema:'source.v1'},{...record,lockfileSha256:'0'.repeat(64)},{...record,packages:[record.packages[0],record.packages[0]]},{...record,packages:[{...record.packages[0],filename:'../cli.tgz'},record.packages[1]]},{...record,attestation:undefined}])assert.throws(()=>validateInputRecord(bad,locked));
});
test('actual transferred tarball mutation fails before provenance execution',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'registry-input-'));try{
 await writeFile(path.join(dir,'inputs.json'),JSON.stringify(record));await writeFile(path.join(dir,'cli.tgz'),'changed');
 await assert.rejects(verifyInputs(path.join(dir,'inputs.json')),/bytes changed/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
