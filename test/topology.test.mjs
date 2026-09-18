import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { validateTopology, verifyNativeProofDigest } from '../scripts/ci-contract.mjs';
const workflow=await readFile(new URL('../.github/workflows/ci.yml',import.meta.url),'utf8');
const proof=await readFile(new URL('../scripts/windows-installed-package-proof.mjs',import.meta.url));
const contract=JSON.parse(await readFile(new URL('./native-proof.json',import.meta.url),'utf8'));
test('Windows CI separates pinned producer, tarball-only consumer and exact native install',()=>validateTopology(workflow));
test('CI red probes reject missing provenance, source shortcuts, skipped native lifecycle and changed bin',()=>{
 for(const [from,to] of [
  ['ref: ${{ steps.pin.outputs.commit }}','ref: main'],
  ['needs: inputs','needs: []'],
  ['needs: consumer-build','needs: consumer-build\n    if: false'],
  ['node scripts/check-digest.mjs inputs/inputs.json EXPECTED_INPUT_SHA256','echo unchecked'],
  ['native tarball digest changed','ignored'],
  ['superbee-windows.cmd','superbee.cmd'],
  ['node out/windows-installed-package-proof.mjs','echo native-proof-skipped'],
 ]) assert.throws(()=>validateTopology(workflow.replace(from,to)),from);
});
test('CI red probes reject missing or ineffective native adapter execution and exit propagation',()=>{
 const invocation='          node native-adapters.mjs\n';
 const guard='          if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }\n';
 const execution=invocation+guard;
 assert.ok(workflow.includes(execution),'native adapter mutation target must exist');
 for(const [name,replacement] of [
  ['deleted invocation',guard],
  ['deleted exit check',invocation],
  ['commented invocation',invocation.replace('node ','# node ')+guard],
  ['echoed invocation',invocation.replace('node ','Write-Output node ')+guard],
  ['conditional invocation',invocation.replace('node ','if ($false) { node ').trimEnd()+' }\n'+guard],
  ['commented exit check',invocation+guard.replace('if (','# if (')],
  ['disabled exit check',invocation+guard.replace('$LASTEXITCODE -ne 0','$false')],
  ['inverted exit check',invocation+guard.replace('-ne','-eq')],
  ['non-terminating exit check',invocation+guard.replace('exit $LASTEXITCODE','Write-Output $LASTEXITCODE')],
  ['masked failure status',invocation+guard.replace('exit $LASTEXITCODE','exit 0')],
  ['overwritten exit status',invocation+'          node --version\n'+guard],
  ['exit check before invocation',guard+invocation],
 ]) {
  const mutated=workflow.replace(execution,replacement);
  assert.notEqual(mutated,workflow,`${name}: mutation must change workflow`);
  assert.throws(()=>validateTopology(mutated),name);
 }
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
