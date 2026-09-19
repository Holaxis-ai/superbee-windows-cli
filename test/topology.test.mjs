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
 const changed=original.replace(from,()=>to);
 assert.notEqual(changed,original,`${name}: mutation must change its job`);
 const mutated=workflow.replace(original,()=>changed);
 for(const other of ['inputs','consumer-build','native-installed','native-readme-build'].filter(x=>x!==name))
  assert.equal(jobBlock(mutated,other),jobBlock(workflow,other),`${other} must remain unchanged`);
 return mutated;
}
const indent='          ';
const guard=indent+'if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }\n';
function execution(command) { return indent+command+'\n'+guard; }
function mixedQuoteWrapper(block) {
 return indent+`$a = '"'; $inert = "`+'\n'+block+indent+`"; $b = '"'`+'\n';
}

for(const [job,commands] of [
 ['native-installed',['node out/check-native-inputs.mjs','node native-adapters.mjs','& $cli --version','node out/windows-installed-package-proof.mjs']],
 ['native-readme-build',['npm test','node out/check-native-inputs.mjs','node native-adapters.mjs','& $cli --version','node out/windows-installed-package-proof.mjs']],
]) for(const command of commands) {
 for(const quote of ["'",'"']) test(`${job}: rejects multiline ${quote} string around ${command}`,()=>{
  const original=execution(command);
  const replacement=indent+'$null = '+quote+'\n'+original+indent+quote+'\n';
  const mutated=mutateJob(job,original,replacement);
  assert.throws(()=>validateTopology(mutated),/native job contract changed/);
 });
 test(`${job}: rejects mixed-even quote wrapper around ${command}`,()=>{
  const original=execution(command);
  const mutated=mutateJob(job,original,mixedQuoteWrapper(original));
  assert.throws(()=>validateTopology(mutated),/native job contract changed/);
 });
 const invocation=indent+command+'\n';
 for(const [name,replacement] of [
  ['deleted invocation',guard],
  ['deleted exit check',invocation],
  ['commented invocation',indent+'# '+command+'\n'+guard],
  ['echoed invocation',indent+'Write-Output '+command+'\n'+guard],
  ['conditional invocation',indent+'if ($false) { '+command+' }\n'+guard],
  ['multiline conditional',indent+'if ($false) {\n'+execution(command).replace(/^/gm,'  ').trimEnd()+'\n'+indent+'}\n'],
  ['unindented conditional',indent+'if ($false) {\n'+execution(command)+indent+'}\n'],
  ['nested conditional opener',indent+'if ($false) { if ($true) { }\n'+execution(command)+indent+'}\n'],
  ['comment-brace conditional opener',indent+'if ($false) { # }\n'+execution(command)+indent+'}\n'],
  ['commented exit check',invocation+guard.replace('if (','# if (')],
  ['disabled exit check',invocation+guard.replace('$LASTEXITCODE -ne 0','$false')],
  ['inverted exit check',invocation+guard.replace('-ne','-eq')],
  ['non-terminating exit check',invocation+guard.replace('exit $LASTEXITCODE','Write-Output $LASTEXITCODE')],
  ['masked failure status',invocation+guard.replace('exit $LASTEXITCODE','exit 0')],
  ['overwritten exit status',invocation+indent+'node --version\n'+guard],
  ['exit check before invocation',guard+invocation],
 ]) test(`${job}: ${command}: rejects ${name}`,()=>{
  const mutated=mutateJob(job,execution(command),replacement);
  assert.throws(()=>validateTopology(mutated),error=>
   error.message.includes('native job contract changed') || error.message.includes(`${command} must execute`),name);
 });
}
for(const job of ['native-installed','native-readme-build']) {
 for(const [name,addition] of [
  ['inline run','      - name: Extra inline step\n        shell: pwsh\n        run: Write-Output added\n'],
  ['literal strip run','      - name: Extra strip step\n        shell: pwsh\n        run: |-\n          Write-Output added\n'],
  ['folded run','      - name: Extra folded step\n        shell: pwsh\n        run: >\n          Write-Output added\n'],
  ['action','      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020\n'],
 ]) test(`${job}: rejects added ${name}`,()=>{
  const original='    steps:\n';
  const mutated=mutateJob(job,original,original+addition);
  assert.throws(()=>validateTopology(mutated),/native job contract changed/);
 });
 test(`${job}: rejects added job environment`,()=>{
  const original='    steps:\n';
  const mutated=mutateJob(job,original,'    env:\n      NODE_OPTIONS: --no-warnings\n'+original);
  assert.throws(()=>validateTopology(mutated),/native job contract changed/);
 });
 test(`${job}: rejects mixed-even quoted digest block`,()=>{
  const block=jobBlock(workflow,job);
  const first=block.indexOf(indent+'$bytes =');
  const last=block.indexOf(indent+'node out/check-native-inputs.mjs');
  assert.ok(first>=0 && last>first,'digest block boundaries must exist');
  const original=block.slice(first,last);
  const mutated=mutateJob(job,original,mixedQuoteWrapper(original));
  assert.throws(()=>validateTopology(mutated),/native job contract changed/);
 });
 test(`${job}: rejects multiline double-quoted digest block`,()=>{
  const block=jobBlock(workflow,job);
  const first=block.indexOf(indent+'$bytes =');
  const last=block.indexOf(indent+'node out/check-native-inputs.mjs');
  assert.ok(first>=0 && last>first,'digest block boundaries must exist');
  const original=block.slice(first,last);
  const replacement=indent+'$null = "\n'+original+indent+'"\n';
  const mutated=mutateJob(job,original,replacement);
  assert.throws(()=>validateTopology(mutated),/native job contract changed/);
 });
 for(const message of ['native input record digest changed','native proof script digest changed','native tarball digest changed']) {
  const statement=jobBlock(workflow,job).split('\n').find(line=>line.includes(message))+'\n';
  for(const [name,replacement] of [
   ['deleted', ''], ['commented',statement.replace('if (','# if (')],
   ['disabled comparison',statement.replace(/if \(.*\) \{ throw/, 'if ($false) { throw')],
   ['non-terminating',statement.replace('throw ', 'Write-Output ')],
  ]) test(`${job}: ${message}: rejects ${name} statement`,()=>{
   const mutated=mutateJob(job,statement,replacement);
   assert.throws(()=>validateTopology(mutated),/native record, helper and tarball digest checks/);
  });
 }
 test(`${job}: rejects changing its renamed executable`,()=>{
  const mutated=mutateJob(job,"$cli = Join-Path $prefix 'superbee-windows.cmd'","$cli = Join-Path $prefix 'superbee.cmd'");
  assert.throws(()=>validateTopology(mutated));
 });
 for(const destination of ['          npm install --ignore-scripts','          npm install --global'])
  test(`${job}: rejects validation after ${destination.trim()}`,()=>{
   const block=jobBlock(workflow,job);
   const install=block.split('\n').find(line=>line.startsWith(destination))+'\n'+guard;
   assert.equal(block.split(install).length-1,1,'install destination must be unique');
   assert.equal(block.split(execution('node out/check-native-inputs.mjs')).length-1,1,'validation must be unique');
   const changed=block.replace(execution('node out/check-native-inputs.mjs'),'').replace(install,()=>install+execution('node out/check-native-inputs.mjs'));
   const mutated=mutateJob(job,block,changed);
   assert.throws(()=>validateTopology(mutated),/native digest checks and validation must precede/);
  });
 test(`${job}: rejects validation before digest checks`,()=>{
  const block=jobBlock(workflow,job);
  const changed=block.replace(execution('node out/check-native-inputs.mjs'),'').replace(indent+'$bytes =',()=>execution('node out/check-native-inputs.mjs')+indent+'$bytes =');
  const mutated=mutateJob(job,block,changed);
  assert.throws(()=>validateTopology(mutated),/native digest checks and validation must precede/);
 });
}
for(const [name,anchor] of [['before README execution','& "$env:RUNNER_TEMP/readme-build.ps1"'],['after artifact preparation','node scripts/prepare-native-proof.mjs']])
 test(`native-readme-build: rejects npm test ${name}`,()=>{
  const block=jobBlock(workflow,'native-readme-build');
  const target=execution(anchor);
  assert.equal(block.split(target).length-1,1);
  const moved=block.replace(execution('npm test'),'').replace(target,()=>name.startsWith('before')?execution('npm test')+target:target+execution('npm test'));
  const mutated=mutateJob('native-readme-build',block,moved);
  assert.throws(()=>validateTopology(mutated),/README execution and tests must precede/);
 });
for(const [job,step] of [
 ['native-installed','Install and drive the exact Windows artifact'],
 ['native-readme-build','Execute the README build block verbatim'],
 ['native-readme-build',"Bind this job's own artifact and native proof"],
 ['native-readme-build','Install and drive the exact Windows artifact'],
]) for(const key of ['if', '"if"', "'if'"]) for(const first of [true,false])
 test(`${job}: rejects ${key} conditional ${first?'first':'later'} key on ${step}`,()=>{
  const original=`      - name: ${step}\n`;
  const replacement=first?`      - ${key}: false\n        name: ${step}\n`:`${original}        ${key}: false\n`;
  const mutated=mutateJob(job,original,replacement);
  assert.throws(()=>validateTopology(mutated),/YAML conditionals/);
 });
for(const command of ['npm test','node scripts/extract-readme-build.mjs "$env:RUNNER_TEMP/readme-build.ps1"','& "$env:RUNNER_TEMP/readme-build.ps1"','node scripts/prepare-native-proof.mjs'])
 test(`native-readme-build: rejects zero-iteration proof loop around ${command}`,()=>{
  const original=execution(command);
  const replacement=indent+'foreach ($file in $record.files.psobject.Properties) {\n'+original+indent+'}\n';
  const mutated=mutateJob('native-readme-build',original,replacement);
  assert.throws(()=>validateTopology(mutated),/native job contract changed/);
 });
test('native-readme-build: even a harmless script comment requires contract review',()=>{
 const original=execution('npm test');
 const mutated=mutateJob('native-readme-build',original,indent+'# Harmless comment\n'+original);
 assert.throws(()=>validateTopology(mutated),/native job contract changed/);
});
function mutatePreamble(from,to) {
 const boundary='\njobs:\n';
 assert.equal(workflow.split(boundary).length,2,'baseline must have one jobs boundary');
 const [preamble,jobs]=workflow.split(boundary);
 assert.equal(preamble.split(from).length-1,1,'preamble mutation target must be unique');
 const changed=preamble.replace(from,()=>to);
 assert.notEqual(changed,preamble,'preamble mutation must change bytes');
 const mutated=changed+boundary+jobs;
 for(const job of ['inputs','consumer-build','native-installed','native-readme-build'])
  assert.equal(jobBlock(mutated,job),jobBlock(workflow,job),`${job} must remain unchanged`);
 return mutated;
}
for(const [name,from,to] of [
 ['inherited NODE_OPTIONS skips tests','name: Windows distribution proof','name: Windows distribution proof\nenv:\n  NODE_OPTIONS: --test-only'],
 ['inherited run defaults','name: Windows distribution proof','name: Windows distribution proof\ndefaults:\n  run:\n    working-directory: out'],
 ['manual-only trigger',"on:\n  pull_request:\n  push:\n    branches: [main, 'feature/**']\n  workflow_dispatch:",'on:\n  workflow_dispatch:'],
]) test(`workflow preamble: rejects ${name} without modifying jobs`,()=>{
 const mutated=mutatePreamble(from,to);
 assert.throws(()=>validateTopology(mutated),/workflow preamble contract changed/);
});
for(const [name,replacement] of [['missing','\nnot-jobs:\n'],['duplicate','\njobs:\njobs:\n']])
 test(`workflow preamble: rejects ${name} jobs boundary`,()=>{
  assert.equal(workflow.split('\njobs:\n').length,2);
  const mutated=workflow.replace('\njobs:\n',()=>replacement);
  assert.notEqual(mutated,workflow);
  assert.throws(()=>validateTopology(mutated),/workflow must contain exactly one literal jobs boundary/);
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
