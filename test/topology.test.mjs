import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { validateTopology, verifyNativeProofDigest } from '../scripts/ci-contract.mjs';
const workflow=await readFile(new URL('../.github/workflows/ci.yml',import.meta.url),'utf8');
const proof=await readFile(new URL('../scripts/windows-installed-package-proof.mjs',import.meta.url));
const contract=JSON.parse(await readFile(new URL('./native-proof.json',import.meta.url),'utf8'));
test('Windows CI separates pinned producer, tarball-only consumer and exact native install',()=>validateTopology(workflow));
test('CI red probes reject missing provenance, source shortcuts, skipped native lifecycle',()=>{
 for(const [from,to] of [
  ['npm run --silent registry:inputs','echo skipped-inputs'],
  ['needs: inputs','needs: []'],
  ['node scripts/extract-readme-build.mjs','echo skipped-readme'],
  ['& "$env:RUNNER_TEMP/readme-build.ps1"','Write-Output skipped-readme'],
  ['node scripts/prepare-native-proof.mjs','echo skipped-proof'],
  ['needs: consumer-build','needs: consumer-build\n    if: false'],
  ['node scripts/check-digest.mjs inputs/inputs.json EXPECTED_INPUT_SHA256','echo unchecked'],
 ]) assert.throws(()=>validateTopology(workflow.replace(from,to)),from);
});
// Each mutation is unique within its named job; duplicate commands in another job
// must never provide accidental coverage for the copy under test.
function jobBlock(source, name) {
 const match=source.match(new RegExp(`^  ${name}:\\n[\\s\\S]*?(?=^  [a-z][a-z-]+:\\n|$(?![\\s\\S]))`,'m'));
 assert.ok(match,`job ${name} must exist`);
 return match[0];
}
function mutateJob(name, from, to) {
 const original=jobBlock(workflow,name);
 assert.equal(original.split(from).length-1,1,`${name}: mutation target must occur exactly once`);
 const changed=original.replace(from,to);
 assert.notEqual(changed,original,`${name}: mutation must change its job`);
 const mutated=workflow.replace(original,changed);
 for(const other of ['inputs','consumer-build','native-installed','native-readme-build'].filter(x=>x!==name))
  assert.equal(jobBlock(mutated,other),jobBlock(workflow,other),`${other} must remain unchanged`);
 return mutated;
}
const indent='          ';
const guard=indent+'if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }\n';
function execution(command) { return indent+command+'\n'+guard; }
for(const [job,commands] of [
 ['native-installed',['node out/check-native-inputs.mjs','node native-adapters.mjs','& $cli --version','node out/windows-installed-package-proof.mjs']],
 ['native-readme-build',['npm test','node out/check-native-inputs.mjs','node native-adapters.mjs','& $cli --version','node out/windows-installed-package-proof.mjs']],
]) for(const command of commands) {
 const invocation=indent+command+'\n';
 for(const [name,replacement] of [
  ['deleted invocation',guard],
  ['deleted exit check',invocation],
  ['commented invocation',indent+'# '+command+'\n'+guard],
  ['echoed invocation',indent+'Write-Output '+command+'\n'+guard],
  ['conditional invocation',indent+'if ($false) { '+command+' }\n'+guard],
  ['multiline conditional',indent+'if ($false) {\n'+execution(command).replace(/^/gm,'  ').trimEnd()+'\n'+indent+'}\n'],
  ['unindented conditional',indent+'if ($false) {\n'+execution(command)+indent+'}\n'],
  ['commented exit check',invocation+guard.replace('if (','# if (')],
  ['disabled exit check',invocation+guard.replace('$LASTEXITCODE -ne 0','$false')],
  ['inverted exit check',invocation+guard.replace('-ne','-eq')],
  ['non-terminating exit check',invocation+guard.replace('exit $LASTEXITCODE','Write-Output $LASTEXITCODE')],
  ['masked failure status',invocation+guard.replace('exit $LASTEXITCODE','exit 0')],
  ['overwritten exit status',invocation+indent+'node --version\n'+guard],
  ['exit check before invocation',guard+invocation],
 ]) test(`${job}: ${command}: rejects ${name}`,()=>{
  assert.throws(()=>validateTopology(mutateJob(job,execution(command),replacement)),name);
 });
}
for(const job of ['native-installed','native-readme-build']) {
 for(const message of ['native input record digest changed','native proof script digest changed','native tarball digest changed']) {
  const statement=jobBlock(workflow,job).split('\n').find(line=>line.includes(message))+'\n';
  for(const [name,replacement] of [
   ['deleted', ''], ['commented',statement.replace('if (','# if (')],
   ['disabled comparison',statement.replace(/if \(.*\) \{ throw/, 'if ($false) { throw')],
   ['non-terminating',statement.replace('throw ', 'Write-Output ')],
  ]) test(`${job}: ${message}: rejects ${name} statement`,()=>{
   assert.throws(()=>validateTopology(mutateJob(job,statement,replacement)));
  });
 }
 test(`${job}: rejects changing its renamed executable`,()=>{
  assert.throws(()=>validateTopology(mutateJob(job,"$cli = Join-Path $prefix 'superbee-windows.cmd'","$cli = Join-Path $prefix 'superbee.cmd'")));
 });
 for(const destination of ['          npm install --ignore-scripts','          npm install --global'])
  test(`${job}: rejects validation after ${destination.trim()}`,()=>{
   const block=jobBlock(workflow,job);
   const install=block.split('\n').find(line=>line.startsWith(destination))+'\n'+guard;
   assert.equal(block.split(install).length-1,1,'install destination must be unique');
   assert.equal(block.split(execution('node out/check-native-inputs.mjs')).length-1,1,'validation must be unique');
   const changed=block.replace(execution('node out/check-native-inputs.mjs'),'').replace(install,install+execution('node out/check-native-inputs.mjs'));
   assert.throws(()=>validateTopology(mutateJob(job,block,changed)));
  });
 test(`${job}: rejects validation before digest checks`,()=>{
  const block=jobBlock(workflow,job);
  const changed=block.replace(execution('node out/check-native-inputs.mjs'),'').replace(indent+'$bytes =',execution('node out/check-native-inputs.mjs')+indent+'$bytes =');
  assert.throws(()=>validateTopology(mutateJob(job,block,changed)));
 });
}
for(const [name,anchor] of [['before README execution','& "$env:RUNNER_TEMP/readme-build.ps1"'],['after artifact preparation','node scripts/prepare-native-proof.mjs']])
 test(`native-readme-build: rejects npm test ${name}`,()=>{
  const block=jobBlock(workflow,'native-readme-build');
  const target=execution(anchor);
  assert.equal(block.split(target).length-1,1);
  const moved=block.replace(execution('npm test'),'').replace(target,name.startsWith('before')?execution('npm test')+target:target+execution('npm test'));
  assert.throws(()=>validateTopology(mutateJob('native-readme-build',block,moved)));
 });
test('reviewed native lifecycle bytes and required scenarios cannot silently disappear',()=>{
 verifyNativeProofDigest(proof,contract.sha256);
 const source=proof.toString();
 for(const name of contract.scenarios) assert.match(source,new RegExp(`await runScenario\\("${name}"`));
 assert.match(source,/assert.equal\(process.platform, "win32"/);
 assert.match(source,/await operation\(\)/);assert.match(source,/WINDOWS_PROOF_FAIL/);
 assert.match(source,/timeout: options.timeoutMs \?\? COMMAND_TIMEOUT_MS/);
});
test('every native proof byte mutation fails its digest, including detached scenario calls',()=>{
 for(const mutated of [Buffer.concat([proof,Buffer.from('\n')]),Buffer.from(proof.toString().replace('await runScenario','void runScenario'))]) assert.throws(()=>verifyNativeProofDigest(mutated,contract.sha256));
});
