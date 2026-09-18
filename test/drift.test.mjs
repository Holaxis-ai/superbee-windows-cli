import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { resolveCandidate, assessDrift, validateDriftTopology } from '../scripts/upstream-drift.mjs';
const old='a'.repeat(40), candidate='b'.repeat(40);
const pin={repository:'Holaxis-ai/superbee',commit:old};
test('resolver freezes exactly one main SHA and stale pin does not prevent an attempt',()=>{
 let calls=0;
 assert.equal(resolveCandidate(pin,(file,args,options)=>{
  calls++;
  assert.equal(file,'git');
  assert.deepEqual(args,['ls-remote','--exit-code','https://github.com/Holaxis-ai/superbee.git','refs/heads/main']);
  assert.ok(options.timeout>0);
  return `${candidate}\trefs/heads/main\n`;
 }),candidate);
 assert.equal(calls,1);
});
test('resolver rejects malformed pins, ambiguous refs, invalid SHAs and network failures',()=>{
 for(const bad of [{...pin,commit:'main'},{...pin,repository:'other/repo'}])
  assert.throws(()=>resolveCandidate(bad,()=>{throw Error('must not resolve');}));
 for(const output of ['',`${candidate}\trefs/heads/other`, `main\trefs/heads/main`,`${candidate}\trefs/heads/main\n${old}\trefs/heads/main`])
  assert.throws(()=>resolveCandidate(pin,()=>output));
 assert.throws(()=>resolveCandidate(pin,()=>{throw Error('network unavailable');}),/network unavailable/);
});
test('only a current pin with both successful build stages is green',()=>{
 assert.equal(assessDrift(old,old,'success','success').ok,true);
 assert.equal(assessDrift(old,candidate,'success','success').ok,false);
 for(const stage of ['failure','cancelled','skipped','',undefined]) {
  assert.equal(assessDrift(old,old,stage,'success').ok,false);
  assert.equal(assessDrift(old,old,'success',stage).ok,false);
 }
 assert.equal(assessDrift('',old,'success','success').ok,false);
});
test('report process writes summary and propagates red/green exits',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'drift-test-'));
 try {
  for(const [label,head,inputs,consumer,status] of [
   ['current',old,'success','success',0],['stale',candidate,'success','success',1],
   ['producer failure',candidate,'failure','skipped',1],['consumer failure',old,'success','failure',1],
   ['missing resolution','','failure','skipped',1],['cancelled',old,'success','cancelled',1],
  ]) {
   const summary=path.join(dir,label+'.md');
   const result=spawnSync(process.execPath,['scripts/upstream-drift.mjs','report'],{encoding:'utf8',env:{...process.env,OLD_COMMIT:old,CANDIDATE_COMMIT:head,INPUTS_RESULT:inputs,CONSUMER_RESULT:consumer,GITHUB_STEP_SUMMARY:summary}});
   assert.equal(result.status,status,`${label}: ${result.stderr}`);
   const text=await readFile(summary,'utf8');
   assert.ok(text.includes(old));
   if(head) assert.ok(text.includes(head));
   assert.ok(text.includes(inputs));assert.ok(text.includes(consumer));
  }
 } finally {await rm(dir,{recursive:true,force:true});}
});
test('temporary repin CLI updates only its checkout and rejects mutable candidates',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'drift-repin-'));
 try {
  await mkdir(path.join(dir,'scripts'));
  for(const name of ['upstream-drift.mjs','inputs.mjs'])
   await writeFile(path.join(dir,'scripts',name),await readFile(new URL(`../scripts/${name}`,import.meta.url)));
  const pinFile=path.join(dir,'upstream-input.json');
  const original=JSON.stringify(pin)+'\n';
  for(const head of [candidate,'main','',`${candidate}\n`,`${candidate}\nextra`]) {
   await writeFile(pinFile,original);
   const result=spawnSync(process.execPath,[path.join(dir,'scripts/upstream-drift.mjs'),'repin'],{encoding:'utf8',env:{...process.env,CANDIDATE_COMMIT:head}});
   assert.equal(result.status,head===candidate?0:1,result.stderr);
   const actual=await readFile(pinFile,'utf8');
   if(head===candidate) assert.deepEqual(JSON.parse(actual),{...pin,commit:candidate});
   else assert.equal(actual,original,'failed repin must preserve original bytes');
  }
 } finally {await rm(dir,{recursive:true,force:true});}
});
const workflow=await readFile(new URL('../.github/workflows/upstream-drift.yml',import.meta.url),'utf8');
test('drift workflow separates temporary producer/consumer builds and always reports',()=>validateDriftTopology(workflow));
test('adversarial workflow mutations fail closed',()=>{
 for(const [from,to] of [
  ['contents: read','contents: write'],['name: drift-inputs','name: inputs'],['persist-credentials: false','persist-credentials: true'],
  ['ref: ${{ steps.resolve.outputs.candidate }}','ref: main'],
  ['npm run --silent produce:inputs','echo skipped-producer'],
  ['npm run build -- --inputs inputs/inputs.json','echo skipped-build'],
  ['node scripts/upstream-drift.mjs report','echo skipped-report'],
  ['if: always()','if: success()'],['needs: [inputs, consumer-build]','needs: inputs'],
  ['needs: inputs','needs: inputs\n    if: false'],
  ['node scripts/check-digest.mjs inputs/inputs.json EXPECTED_INPUT_SHA256','echo unchecked'],
  ['node scripts/upstream-drift.mjs repin','echo skipped-repin'],
  ['timeout-minutes: 20','timeout-minutes: 0'],
 ]) {
  assert.ok(workflow.includes(from),from);
  assert.throws(()=>validateDriftTopology(workflow.replace(from,to)),from);
 }
 for(const extra of ['\n# continue-on-error: true','\n# git push','\n# gh issue create'])
  assert.throws(()=>validateDriftTopology(workflow+extra));
});
