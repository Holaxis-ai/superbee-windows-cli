import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { createWindowsFilesystemHostPolicy } from '../src/filesystem.js';

test('Windows locks retain the stable account namespace rather than session temp overrides', () => {
  const policy=createWindowsFilesystemHostPolicy({home:()=>String.raw`C:\Users\mike`,username:()=> 'mike'});
  assert.equal(policy.runtimeLockParent(),String.raw`C:\Users\mike\AppData\Local`);
  assert.equal(policy.runtimeOwnerKey(),`user-${createHash('sha256').update('mike').digest('hex').slice(0,16)}`);
  assert.equal(policy.enforcePrivateMode,false);
  const fallback=createWindowsFilesystemHostPolicy({username:()=>{throw Error('unavailable');}});
  assert.equal(fallback.runtimeOwnerKey(),`user-${createHash('sha256').update('unknown').digest('hex').slice(0,16)}`);
});

test('Windows open, replacement, directory and durable denial classes remain distinct', () => {
  const policy=createWindowsFilesystemHostPolicy();
  for (const code of ['EPERM','EACCES','EBUSY','ENOTEMPTY','ENOENT','EIO','EEXIST',undefined]) {
    const error={code};
    assert.equal(policy.isTransientOpenError(error),code==='EPERM',String(code));
    assert.equal(policy.isReplacementConflict(error),['EPERM','EACCES','EBUSY'].includes(code!),String(code));
    // A delete-on-close leftover inside a lock directory is directory contention, never a file replacement conflict.
    assert.equal(policy.isDirectoryContentionError(error),['EPERM','EACCES','EBUSY','ENOTEMPTY'].includes(code!),String(code));
  }
  assert.equal(policy.isReplacementConflict(null),false);
  assert.equal(policy.isTransientOpenError('EPERM'),false);
  assert.equal(policy.isReplacementConflict({code:{toString:()=> 'EPERM'}}),false);
});
