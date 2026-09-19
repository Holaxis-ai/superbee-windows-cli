import assert from 'node:assert/strict';
import { sha256 } from './inputs.mjs';
export function verifyNativeProofDigest(bytes, expected) {
 assert.match(expected,/^[a-f0-9]{64}$/);
 assert.equal(sha256(bytes),expected,'native proof bytes differ from reviewed digest');
}
const indent='          ';
const exitGuard='if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }';
const proofFilesLoop='foreach ($file in $record.files.psobject.Properties) {';
const digestBlock=[
  "$bytes = [System.IO.File]::ReadAllBytes((Join-Path $pwd 'out/native-inputs.json'))",
  '$digest = [Convert]::ToHexString([System.Security.Cryptography.SHA256]::HashData($bytes)).ToLowerInvariant()',
  "if ($digest -ne $env:EXPECTED_PROOF_SHA256) { throw 'native input record digest changed' }",
  '$record = Get-Content -Raw out/native-inputs.json | ConvertFrom-Json',
  proofFilesLoop,
  "  if ($file.Name -notmatch '^[a-z0-9][a-z0-9.-]+$') { throw 'invalid proof filename' }",
  "  if ((Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $pwd ('out/' + $file.Name))).Hash.ToLowerInvariant() -ne $file.Value) { throw 'native proof script digest changed' }",
  '}',
  "if ($record.tarball -notmatch '^[a-z0-9][a-z0-9.-]+\\.tgz$') { throw 'invalid tarball filename' }",
  "if ((Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $pwd ('out/' + $record.tarball))).Hash.ToLowerInvariant() -ne $record.sha256) { throw 'native tarball digest changed' }",
 ].map(line=>indent+line+'\n').join('');
// Reviewed workflow-script fixtures, separate from the immutable native proof
// source digest. Any native run-block edit requires conscious contract review;
// never derive these expected fingerprints from the workflow during tests.
const nativeScriptDigests={
 'native-installed':['6d1f4da76b0d0aa3e69875eff00ef37766c5c06df7e1fa6634b91f1ee771c4f2'],
 'native-readme-build':[
  'c780bf30b7735313f96c97ab48f1c2d29a1a19cc550abe4db60913ce03e7334e',
  '030e1878c3c9080242d226d9efa149eba680718a4224d2c675c250bace218208',
  '6d1f4da76b0d0aa3e69875eff00ef37766c5c06df7e1fa6634b91f1ee771c4f2',
 ],
};
// This contract deliberately supports the repository's literal pwsh run blocks,
// not arbitrary YAML or PowerShell. A structural change needs contract review.
function nativeRuns(job) {
 const runs=[];
 for(const step of job.split(/^      - /m).slice(1)) {
  const match=step.match(/^        run: \|\n((?:          [^\n]*\n|\n)+)/m);
  if(!match) continue;
  assert.match(step,/^        shell: pwsh$/m,'native run blocks must use pwsh');
  runs.push(match[1]);
 }
 return runs;
}
function requireExecution(job, runs, command) {
 const block=indent+command+'\n'+indent+exitGuard+'\n';
 assert.equal(runs.filter(run=>('\n'+run).includes('\n'+block)).length,1,`${command} must execute at run scope with adjacent nonzero-exit propagation`);
 assert.equal(job.split(block).length-1,1,`${command} must have one execution`);
 return job.indexOf(block);
}
function requireDigestChecks(job, runs) {
 assert.equal(runs.filter(run=>('\n'+run).includes('\n'+digestBlock)).length,1,'native record, helper and tarball digest checks must execute and throw on mismatch');
 return job.indexOf(digestBlock)+digestBlock.length;
}
export function validateTopology(workflow) {
 const jobs={};
 const jobText=workflow.slice(workflow.indexOf('\njobs:\n')+7);
 for(const match of jobText.matchAll(/^  ([a-z][a-z-]+):\n([\s\S]*?)(?=^  [a-z][a-z-]+:\n|$(?![\s\S]))/gm)) jobs[match[1]]=match[2];
 assert.deepEqual(Object.keys(jobs),['inputs','consumer-build','native-installed','native-readme-build']);
 assert.doesNotMatch(workflow,/repository:\s*Holaxis-ai\/superbee\s*\n|upstream-source|produce:inputs/);
 assert.match(jobs.inputs,/npm run --silent registry:inputs/);
 assert.match(workflow,/permissions:\n  contents: read/);
 for(const job of Object.values(jobs)) assert.match(job,/timeout-minutes: [1-9][0-9]?\n/);
 for(const match of workflow.matchAll(/uses: ([^\n]+)/g)) assert.match(match[1],/^actions\/[a-z-]+@[a-f0-9]{40}$/);
 assert.match(jobs['consumer-build'],/needs: inputs/);
 assert.doesNotMatch(jobs['consumer-build'],/repository:\s*Holaxis-ai\/superbee\s*\n|ref:\s*main/);
 assert.match(jobs['consumer-build'],/EXPECTED_INPUT_SHA256: \$\{\{ needs.inputs.outputs.record_sha256 \}\}/);
 assert.match(jobs['consumer-build'],/node scripts\/check-digest.mjs inputs\/inputs.json EXPECTED_INPUT_SHA256/);
 assert.match(jobs['consumer-build'],/npm run build -- --inputs inputs\/inputs.json/);
 assert.match(jobs['consumer-build'],/npm run verify:package -- --inputs inputs\/inputs.json/);
 assert.match(jobs['consumer-build'],/node scripts\/prepare-native-proof.mjs/);
 const readme=jobs['native-readme-build'];
 assert.match(readme,/runs-on: windows-latest/);assert.match(readme,/node-version: 20/);
 const readmeRuns=nativeRuns(readme);
 const extract=requireExecution(readme,readmeRuns,'node scripts/extract-readme-build.mjs "$env:RUNNER_TEMP/readme-build.ps1"');
 const build=requireExecution(readme,readmeRuns,'& "$env:RUNNER_TEMP/readme-build.ps1"');
 const tests=requireExecution(readme,readmeRuns,'npm test');
 const prepare=requireExecution(readme,readmeRuns,'node scripts/prepare-native-proof.mjs');
 assert.ok(extract < build && build < tests && tests < prepare,'README execution and tests must precede own-artifact preparation');
 assert.doesNotMatch(readme,/download-artifact|needs:/);
 assert.match(readme,/EXPECTED_PROOF_SHA256: \$\{\{ steps.proof.outputs.proof_sha256 \}\}/);
 const native=jobs['native-installed'];
 assert.match(native,/needs: consumer-build/);assert.match(native,/runs-on: windows-latest/);
 assert.match(native,/node-version: 20/);assert.doesNotMatch(native,/actions\/checkout|npm run build|npm pack/);
 assert.match(native,/EXPECTED_PROOF_SHA256: \$\{\{ needs.consumer-build.outputs.proof_sha256 \}\}/);
 for(const native of [jobs['native-installed'],readme]) {
 const runs=nativeRuns(native);
 const digestEnd=requireDigestChecks(native,runs);
 const validation=requireExecution(native,runs,'node out/check-native-inputs.mjs');
 const firstInstall=native.search(/^          npm install /m);
 const adapters=requireExecution(native,runs,'node native-adapters.mjs');
 const cli=requireExecution(native,runs,'& $cli --version');
 const proof=requireExecution(native,runs,'node out/windows-installed-package-proof.mjs');
 assert.ok(firstInstall>=0 && digestEnd<=validation && validation<firstInstall && firstInstall<adapters && adapters<cli && cli<proof,
  'native digest checks and validation must precede the first artifact install and execution');
 assert.match(native,/^          \$cli = Join-Path \$prefix 'superbee-windows.cmd'$/m);
 assert.match(native,/existing first-party bin changed/);
 assert.match(native,/\$env:SUPERBEE_WINDOWS_INSTALLED_ENTRYPOINT = Join-Path \$prefix 'node_modules\/@superbee\/windows-cli\/dist\/superbee-windows.mjs'/);
 }
 assert.doesNotMatch(workflow,/^\s*(?:- +)?(?:if|"if"|'if')\s*:/m,'native CI cannot contain YAML conditionals');
 assert.doesNotMatch(workflow,/continue-on-error|npm (?:publish|stage)|id-token: write|exit 0/m);
 assert.doesNotMatch(native,/git clone|upstream-source/);
 // Targeted checks above explain missing commands, guards, digests and order.
 // The final byte contract catches other literal-script edits without parsing pwsh.
 for(const [name,expected] of Object.entries(nativeScriptDigests))
  assert.deepEqual(nativeRuns(jobs[name]).map(sha256),expected,`${name}: native literal script contract changed; review script bytes and fingerprints together`);

}
