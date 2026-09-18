import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, realpath, lstat } from 'node:fs/promises';
import path from 'node:path';
import { readLockedPackages, verifyIntegrity } from './registry-inputs.mjs';
import { verifyProvenance } from './provenance.mjs';
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
export const digestPattern=/^[a-f0-9]{64}(?![\s\S])/;
export function validateInputRecord(record,locked) {
 assert.equal(record.schema,'superbee.registry-inputs.v1','legacy source inputs unsupported; run npm run registry:inputs');
 assert.equal(record.lockfileSha256,locked.lockfileSha256,'inputs differ from current lockfile');assert.match(record.lockfileSha256 ?? '',digestPattern);
 assert.match(record.node ?? '',/^v\d+\.\d+\.\d+(?![\s\S])/);assert.match(record.npm ?? '',/^\d+\.\d+\.\d+(?![\s\S])/);
 assert.deepEqual(record.packages?.map(p=>p.name).sort(),['@superbee/cli','@superbee/core']);
 for(const pkg of record.packages){const expected=locked.packages.find(p=>p.name===pkg.name);for(const key of ['name','version','resolved','integrity'])assert.equal(pkg[key],expected[key],`input ${key} differs from lock`);
 assert.match(pkg.filename ?? '',/^[a-z0-9][a-z0-9.-]*\.tgz(?![\s\S])/);assert.match(pkg.sha256 ?? '',digestPattern);}
 assert.equal(new Set(record.packages.map(p=>p.filename)).size,2);assert.equal(record.attestation?.filename,'provenance.json');assert.match(record.attestation.sha256 ?? '',digestPattern);return record;
}
export async function verifyInputs(recordPath,directory) {
 assert.ok((await lstat(recordPath)).isFile() && !(await lstat(recordPath)).isSymbolicLink(),'input record must be regular');
 const record=JSON.parse(await readFile(recordPath,'utf8'));validateInputRecord(record,await readLockedPackages(directory));
 const root=path.dirname(await realpath(recordPath));const packages=[];
 async function checked(filename,digest){const file=path.join(root,filename);const stat=await lstat(file);assert.ok(stat.isFile() && !stat.isSymbolicLink(),'input must be regular file');const bytes=await readFile(file);assert.equal(sha256(bytes),digest,'input bytes changed');return {file,bytes};}
 for(const pkg of record.packages){const {file,bytes}=await checked(pkg.filename,pkg.sha256);verifyIntegrity(bytes,pkg.integrity);packages.push({...pkg,file});}
 const evidence=await checked(record.attestation.filename,record.attestation.sha256);const cli=packages.find(p=>p.name==='@superbee/cli');
 const provenance=await verifyProvenance(JSON.parse(evidence.bytes),cli.version,cli.sha256,path.join(root,'tuf-cache'));
 assert.deepEqual(record.provenance,provenance,'transported provenance claim differs from signed evidence');
 return {...record,packages,provenance,recordPath:await realpath(recordPath)};
}
