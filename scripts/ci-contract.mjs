import assert from 'node:assert/strict';
import { sha256 } from './inputs.mjs';
export function verifyNativeProofDigest(bytes, expected) {
 assert.match(expected,/^[a-f0-9]{64}$/);
 assert.equal(sha256(bytes),expected,'native proof bytes differ from reviewed digest');
}
export function validateTopology(workflow) {
 const jobs={};
 const jobText=workflow.slice(workflow.indexOf('\njobs:\n')+7);
 for(const match of jobText.matchAll(/^  ([a-z][a-z-]+):\n([\s\S]*?)(?=^  [a-z][a-z-]+:\n|$(?![\s\S]))/gm)) jobs[match[1]]=match[2];
 assert.deepEqual(Object.keys(jobs),['inputs','consumer-build','native-installed']);
 assert.match(jobs.inputs,/repository: Holaxis-ai\/superbee\n\s+ref: \$\{\{ steps.pin.outputs.commit \}\}/);
 assert.match(jobs.inputs,/npm run --silent produce:inputs/);
 assert.match(jobs['consumer-build'],/needs: inputs/);
 assert.doesNotMatch(jobs['consumer-build'],/repository:\s*Holaxis-ai\/superbee\s*\n|ref:\s*main/);
 assert.match(jobs['consumer-build'],/EXPECTED_INPUT_SHA256: \$\{\{ needs.inputs.outputs.record_sha256 \}\}/);
 assert.match(jobs['consumer-build'],/node scripts\/check-digest.mjs inputs\/inputs.json EXPECTED_INPUT_SHA256/);
 assert.match(jobs['consumer-build'],/npm run build -- --inputs inputs\/inputs.json/);
 assert.match(jobs['consumer-build'],/npm run verify:package -- --inputs inputs\/inputs.json/);
 const native=jobs['native-installed'];
 assert.match(native,/needs: consumer-build/);assert.match(native,/runs-on: windows-latest/);
 assert.match(native,/node-version: 20/);assert.doesNotMatch(native,/actions\/checkout|npm run build|npm pack/);
 assert.match(native,/EXPECTED_PROOF_SHA256: \$\{\{ needs.consumer-build.outputs.proof_sha256 \}\}/);
 assert.match(native,/native input record digest changed/);assert.match(native,/native proof script digest changed/);assert.match(native,/native tarball digest changed/);
 assert.ok(native.indexOf('native tarball digest changed') < native.indexOf('npm install --global $tarball'));
 // Hashing the adapter script is not execution proof: require the command and its immediate failure guard.
 assert.match(native,/^([ \t]+)node native-adapters\.mjs[ \t]*\r?\n\1if \(\$LASTEXITCODE -ne 0\) \{ exit \$LASTEXITCODE \}[ \t]*$/m,
  'native adapters must execute with adjacent nonzero-exit propagation');
 assert.match(native,/\$cli = Join-Path \$prefix 'superbee-windows.cmd'/);
 assert.match(native,/& \$cli --version/);assert.match(native,/existing first-party bin changed/);
 assert.match(native,/\$env:SUPERBEE_WINDOWS_INSTALLED_ENTRYPOINT = Join-Path \$prefix 'node_modules\/@superbee\/windows-cli\/dist\/superbee-windows.mjs'/);
 assert.match(native,/node out\/windows-installed-package-proof.mjs\n\s+if \(\$LASTEXITCODE -ne 0\) \{ exit \$LASTEXITCODE \}/);
 assert.doesNotMatch(workflow,/continue-on-error|npm (?:publish|stage)|id-token: write|^\s+if:|exit 0/m);
 assert.doesNotMatch(native,/git clone|upstream-source/);
}
