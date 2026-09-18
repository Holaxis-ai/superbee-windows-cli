import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { appendFile, readFile, realpath, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { upstreamRepository } from './inputs.mjs';
// Strict end-of-input also rejects a trailing newline in action output values.
const sha = /^[a-f0-9]{40}(?![\s\S])/;
function validatePin(pin) {
  assert.equal(pin.repository, upstreamRepository);
  assert.match(pin.commit ?? '', sha, 'upstream pin must be an immutable SHA');
}
export function resolveCandidate(pin, run = execFileSync) {
  validatePin(pin);
  const output = run('git', ['ls-remote', '--exit-code', `https://github.com/${upstreamRepository}.git`, 'refs/heads/main'],
    { encoding: 'utf8', timeout: 60_000 }).trim();
  assert.match(output, /^[a-f0-9]{40}\trefs\/heads\/main$/, 'expected exactly one immutable main SHA');
  return output.split('\t')[0];
}
export function assessDrift(old, candidate, producer, consumer) {
  const valid = sha.test(old ?? '') && sha.test(candidate ?? '');
  const built = producer === 'success' && consumer === 'success';
  const stale = valid && old !== candidate;
  return { ok: valid && built && !stale, reason: !valid ? 'Resolution missing or invalid' :
    !built ? 'Candidate build failed or did not complete' : stale ? 'Upstream pin is stale; candidate build passed' : 'Current pin; candidate build passed' };
}
export async function main(command, env = process.env) {
  if (command === 'report') {
    const { OLD_COMMIT: old, CANDIDATE_COMMIT: candidate, INPUTS_RESULT: producer, CONSUMER_RESULT: consumer } = env;
    const result = assessDrift(old, candidate, producer, consumer);
    // SHAs and fixed job statuses only: never render untrusted network text into Markdown.
    const safeSha = value => sha.test(value ?? '') ? value : '(unavailable)';
    const safeStatus = value => ['success','failure','cancelled','skipped'].includes(value) ? value : '(unavailable)';
    const summary = `## Upstream drift\n\nOld pin: ${safeSha(old)}\n\nCandidate: ${safeSha(candidate)}\n\nProducer: ${safeStatus(producer)}\n\nConsumer: ${safeStatus(consumer)}\n\n${result.reason}.\n\nThis is a temporary repin/build attempt, not native Windows proof or an accepted pin update.\n`;
    if (env.GITHUB_STEP_SUMMARY) await appendFile(env.GITHUB_STEP_SUMMARY, summary);
    process.stdout.write(summary);
    return result.ok ? 0 : 1;
  }
  assert.ok(['resolve','repin'].includes(command), 'usage: upstream-drift.mjs resolve|repin|report');
  const pinPath = new URL('../upstream-input.json', import.meta.url);
  const pin = JSON.parse(await readFile(pinPath, 'utf8'));
  validatePin(pin);
  if (command === 'resolve') {
    assert.ok(env.GITHUB_OUTPUT, 'GITHUB_OUTPUT is required');
    await appendFile(env.GITHUB_OUTPUT, `old=${pin.commit}\n`);
    const candidate = resolveCandidate(pin);
    await appendFile(env.GITHUB_OUTPUT, `candidate=${candidate}\n`);
    // Only the disposable Actions checkout changes. No branch or accepted pin is updated.
    await writeFile(pinPath, JSON.stringify({ ...pin, commit: candidate }, null, 2) + '\n');
  } else {
    assert.match(env.CANDIDATE_COMMIT ?? '', sha, 'candidate SHA is required');
    await writeFile(pinPath, JSON.stringify({ ...pin, commit: env.CANDIDATE_COMMIT }, null, 2) + '\n');
  }
  return 0;
}

// Keep topology checks alongside the runner so adversarial tests guard the actual workflow.
export function validateDriftTopology(workflow) {
  assert.match(workflow, /schedule:\n\s+- cron:/);
  assert.match(workflow, /permissions:\n  contents: read\n/);
  assert.doesNotMatch(workflow, /continue-on-error|: write|id-token:|git push|git commit|gh (?:issue|pr|release)|npm publish|exit 0|persist-credentials: true/);
  const jobs = {};
  for (const match of workflow.matchAll(/^  ([a-z][a-z-]+):\n([\s\S]*?)(?=^  [a-z][a-z-]+:\n|$(?![\s\S]))/gm)) jobs[match[1]] = match[2];
  assert.deepEqual(Object.keys(jobs).filter(name => ['inputs','consumer-build','report'].includes(name)), ['inputs','consumer-build','report']);
  for (const name of ['inputs','consumer-build','report']) {
    assert.match(jobs[name], /timeout-minutes: (?:[1-9]|[1-9][0-9])\n/);
    assert.ok(jobs[name].startsWith(`    name: drift-${name}\n`), 'drift checks must not collide with required Windows proof checks');
  }
  const producer = jobs.inputs, consumer = jobs['consumer-build'], report = jobs.report;
  assert.doesNotMatch(producer + consumer, /^\s+if:/m);
  assert.equal((report.match(/^\s+if:/gm) ?? []).length, 1);
  assert.match(producer, /run: node scripts\/upstream-drift\.mjs resolve\n/);
  assert.match(producer, /repository: Holaxis-ai\/superbee\n\s+ref: \$\{\{ steps.resolve.outputs.candidate \}\}/);
  assert.match(producer, /^\s+npm run --silent produce:inputs upstream-source "\$RUNNER_TEMP\/inputs" > "\$RUNNER_TEMP\/producer.json"$/m);
  assert.match(consumer, /needs: inputs/);
  assert.doesNotMatch(consumer, /repository:|ref: main/);
  assert.match(consumer, /CANDIDATE_COMMIT: \$\{\{ needs.inputs.outputs.candidate \}\}/);
  assert.match(consumer, /run: node scripts\/upstream-drift\.mjs repin\n/);
  assert.match(consumer, /EXPECTED_INPUT_SHA256: \$\{\{ needs.inputs.outputs.record_sha256 \}\}/);
  assert.match(consumer, /run: node scripts\/check-digest\.mjs inputs\/inputs.json EXPECTED_INPUT_SHA256\n/);
  for (const command of ['npm run build -- --inputs inputs/inputs.json','npm run verify:package -- --inputs inputs/inputs.json'])
    assert.ok(consumer.split('\n').some(line => line.trim() === command));
  assert.match(report, /needs: \[inputs, consumer-build\]\n    if: always\(\)/);
  assert.match(report, /run: node scripts\/upstream-drift\.mjs report\n/);
  for (const [name, value] of Object.entries({OLD_COMMIT:'needs.inputs.outputs.old', CANDIDATE_COMMIT:'needs.inputs.outputs.candidate', INPUTS_RESULT:'needs.inputs.result', CONSUMER_RESULT:'needs.consumer-build.result'}))
    assert.ok(report.includes(`${name}: \${{ ${value} }}`));
  for (const match of workflow.matchAll(/uses: ([^\n]+)/g)) assert.match(match[1], /^actions\/[a-z-]+@[a-f0-9]{40}$/);
  assert.equal((workflow.match(/uses: actions\/checkout@/g) ?? []).length, (workflow.match(/persist-credentials: false/g) ?? []).length);
}
if (process.argv[1] && import.meta.url === pathToFileURL(await realpath(process.argv[1])).href) {
  try { process.exitCode = await main(process.argv[2]); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
