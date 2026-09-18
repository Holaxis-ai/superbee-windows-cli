import assert from 'node:assert/strict';
import test from 'node:test';
import { constants } from 'node:fs';
import { windowsPrivateStateHost as host, resolveUserStatePolicy, userStateEnvironment } from '../src/private-state.js';
const environment={platform:'win32' as const,home:String.raw`C:\Users\mike`,env:{LOCALAPPDATA:String.raw`C:\Users\mike\AppData\Local`}};

test('Windows known folder policy guards every released and prerelease source', () => {
  const policy=resolveUserStatePolicy(environment);
  assert.equal(policy.state,'ready');
  assert.equal(policy.canonicalRoot,String.raw`C:\Users\mike\AppData\Local\Superbee`);
  assert.deepEqual(policy.guardedRoots,[String.raw`C:\Users\mike\AppData\Local\Superbee`,String.raw`C:\Users\mike\.superbee-state`,String.raw`C:\Users\mike\.config\superbee`,String.raw`C:\Users\mike\.agentstate`]);
  assert.equal(host.displayPath(environment,policy.canonicalRoot!+'\\catalog.json'),String.raw`%LOCALAPPDATA%\Superbee\catalog.json`);
  assert.equal(host.displayPath(environment,environment.home),'%USERPROFILE%');
});
test('Windows accepts normalized drive and UNC authority, refuses device and relative authority', () => {
  for (const value of ['', 'relative','C:relative','\\relative','\\\\?\\C:\\Users\\mike','\\\\.\\C:\\Users\\mike','\\??\\C:\\Users\\mike']) {
    const policy=resolveUserStatePolicy({...environment,env:{LOCALAPPDATA:value}});
    assert.equal(policy.state,'blocked',value);assert.equal(policy.canonicalRoot,null);assert.match(policy.reason!,/LOCALAPPDATA/);
  }
  const policy=resolveUserStatePolicy({...environment,env:{LOCALAPPDATA:'//server/profiles/mike/AppData/Local/../Local'}});
  assert.equal(policy.canonicalRoot,String.raw`\\server\profiles\mike\AppData\Local\Superbee`);
  assert.throws(()=>resolveUserStatePolicy({...environment,home:'relative'}),/absolute/);
});
test('Windows migration source precedence and marker requirements are preserved', () => {
  assert.deepEqual(host.migrationSources(environment),[
    {root:String.raw`C:\Users\mike\.superbee-state`,display:String.raw`%USERPROFILE%\.superbee-state`,requiresMarker:true},
    {root:String.raw`C:\Users\mike\.config\superbee`,display:String.raw`%USERPROFILE%\.config\superbee`,requiresMarker:true},
    {root:String.raw`C:\Users\mike\.agentstate`,display:String.raw`%USERPROFILE%\.agentstate`,requiresMarker:false},
  ]);
  assert.equal(host.currentUid(),undefined);assert.equal(host.enforcePrivateMode,false);
  assert.deepEqual(host.privateRead,{flags:constants.O_RDONLY|constants.O_NONBLOCK,inspectBeforeOpen:true});
  for(const code of ['EPERM','EBUSY','EACCES','ENOENT']) assert.equal(host.isTransientConfigReplaceError({code}),['EPERM','EBUSY'].includes(code));
});
test('injected Windows profile stays isolated and full environment preserves redirected authority', () => {
  assert.equal(userStateEnvironment(String.raw`Z:\injected\profile`).env.LOCALAPPDATA,String.raw`Z:\injected\profile\AppData\Local`);
  assert.equal(userStateEnvironment(environment),environment);
  assert.equal(host.sourceInspectionCommand('ignored',true,'superbee-windows setup'),'superbee-windows setup');
  assert.match(host.bundleBoundaryRecovery('private','superbee-windows'),/superbee-windows init --create-only/);
});
