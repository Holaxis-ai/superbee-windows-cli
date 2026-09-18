import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, realpath, lstat } from 'node:fs/promises';
import path from 'node:path';
export const upstreamRepository = 'Holaxis-ai/superbee';
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export function validateInputRecord(record, pin) {
  assert.equal(record.repository,upstreamRepository);
  assert.match(record.commit ?? '',/^[a-f0-9]{40}$/,'input source must be a full immutable commit');
  assert.match(pin.commit ?? '',/^[a-f0-9]{40}$/,'upstream-input.json needs the pinned implementation commit');
  assert.equal(record.commit,pin.commit,'input source commit differs from committed pin');
  assert.match(record.lockfileSha256 ?? '',/^[a-f0-9]{64}$/);
  assert.match(record.node ?? '',/^v\d+\.\d+\.\d+$/);
  assert.match(record.npm ?? '',/^\d+\.\d+\.\d+$/);
  assert.deepEqual(record.packages?.map(p=>p.name).sort(),['@superbee/cli','@superbee/core']);
  for(const pkg of record.packages) {
    assert.equal(typeof pkg.version,'string');assert.ok(pkg.version.length);
    assert.match(pkg.filename,/^[a-z0-9][a-z0-9.-]*\.tgz$/);
    assert.match(pkg.sha256,/^[a-f0-9]{64}$/);
  }
  assert.equal(new Set(record.packages.map(p=>p.filename)).size,2);
  return record;
}
export async function verifyInputs(recordPath, pinPath=new URL('../upstream-input.json',import.meta.url)) {
  const [record,pin]=await Promise.all([readFile(recordPath,'utf8').then(JSON.parse),readFile(pinPath,'utf8').then(JSON.parse)]);
  validateInputRecord(record,pin);
  const root=path.dirname(await realpath(recordPath));
  const packages=[];
  for(const pkg of record.packages) {
    const file=path.join(root,pkg.filename);
    assert.equal((await lstat(file)).isSymbolicLink(),false,'input tarball cannot be a symlink');
    assert.equal(sha256(await readFile(file)),pkg.sha256,`${pkg.name} input bytes changed`);
    packages.push({...pkg,file});
  }
  return {...record,packages};
}
