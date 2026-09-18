import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { appendFile, readFile, writeFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { root, names, validatePackage, readLockedPackages } from './registry-lock.mjs';
import {createHash} from 'node:crypto';
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function resolveCandidate(fetcher) {
 fetcher ??= (await import('./registry-inputs.mjs')).fetchBytes;
 const packages=[];
 for(const name of names){const row=JSON.parse(await fetcher(`https://registry.npmjs.org/${name}/next`));assert.equal(row.name,name);packages.push(validatePackage({name,version:row.version,resolved:row.dist?.tarball,integrity:row.dist?.integrity}));}
 return packages;
}
function validPair(pair){try{assert.deepEqual(pair.map(p=>p.name),names);pair.forEach(validatePackage);return true;}catch{return false;}}
export function assessDrift(old,candidate,producer,consumer) {
 const valid=validPair(old) && validPair(candidate),built=producer==='success' && consumer==='success';
 const stale=valid && JSON.stringify(old)!==JSON.stringify(candidate);
 return {ok:valid && built && !stale,reason:!valid?'Resolution missing or invalid':!built?'Candidate build failed or did not complete':stale?'Registry pins are stale; candidate build passed':'Current pins; candidate build passed'};
}
export async function transferCandidate(directory,output){
 const recordPath=path.join(output,'inputs.json'),record=JSON.parse(await readFile(recordPath,'utf8'));record.candidateFiles={};
 for(const name of ['package.json','package-lock.json']){const bytes=await readFile(path.join(directory,name));await writeFile(path.join(output,name),bytes);record.candidateFiles[name]=sha256(bytes);}
 await writeFile(recordPath,JSON.stringify(record,null,2)+'\n');return sha256(await readFile(recordPath));
}
export async function restoreCandidate(output,directory){
 const record=JSON.parse(await readFile(path.join(output,'inputs.json'),'utf8'));const files=[];
 for(const name of ['package.json','package-lock.json']){const bytes=await readFile(path.join(output,name));assert.equal(sha256(bytes),record.candidateFiles?.[name],'candidate manifest bytes changed');files.push([name,bytes]);}
 assert.equal(sha256(files[1][1]),record.lockfileSha256,'candidate lock differs from input record');
 for(const [name,bytes] of files)await writeFile(path.join(directory,name),bytes);
 await readLockedPackages(directory);
}
export async function repinCandidate(candidate,{directory=root,run=execFileSync,npm=process.env.npm_execpath}={}) {
 assert.ok(validPair(candidate),'frozen exact candidate pair required');assert.ok(npm,'run resolve through npm exec');
 const manifest=JSON.parse(await readFile(path.join(directory,'package.json'),'utf8'));
 const lock=JSON.parse(await readFile(path.join(directory,'package-lock.json'),'utf8'));
 for(const pkg of candidate){manifest.devDependencies[pkg.name]=pkg.version;delete lock.packages['node_modules/'+pkg.name];}
 await writeFile(path.join(directory,'package.json'),JSON.stringify(manifest,null,2)+'\n');
 // Remove only the candidate rows so even integrity-only drift is regenerated from exact versions.
 await writeFile(path.join(directory,'package-lock.json'),JSON.stringify(lock,null,2)+'\n');
 run(process.execPath,[npm,'install','--package-lock-only','--ignore-scripts','--force','--prefer-online','--no-audit','--no-fund','--registry=https://registry.npmjs.org'],{cwd:directory,stdio:'inherit'});
 assert.deepEqual((await readLockedPackages(directory)).packages,candidate,'generated candidate lock differs from frozen registry metadata');
}
export async function main(command,env=process.env){
 if(command==='report'){
 const parse=value=>{try{return JSON.parse(value);}catch{return null;}};
 const old=parse(env.OLD_PAIR),candidate=parse(env.CANDIDATE_PAIR);const result=assessDrift(old,candidate,env.INPUTS_RESULT,env.CONSUMER_RESULT);
 const safe=pair=>validPair(pair)?pair.map(p=>`${p.name}@${p.version} ${p.integrity}`).join('\n'):'(unavailable)';
 const status=value=>['success','failure','cancelled','skipped'].includes(value)?value:'(unavailable)';
 const summary=`## Registry drift\n\nOld pins:\n${safe(old)}\n\nCandidate:\n${safe(candidate)}\n\nInputs: ${status(env.INPUTS_RESULT)}\nConsumer: ${status(env.CONSUMER_RESULT)}\n\n${result.reason}.\n\nDisposable compatibility attempt only; accepted pins and native proof are unchanged.\n`;
 if(env.GITHUB_STEP_SUMMARY)await appendFile(env.GITHUB_STEP_SUMMARY,summary);console.log(summary);return result.ok?0:1;
 }
 if(command==='resolve'){
 assert.ok(env.GITHUB_OUTPUT);const old=(await readLockedPackages()).packages;await appendFile(env.GITHUB_OUTPUT,`old=${JSON.stringify(old)}\n`);
 const candidate=await resolveCandidate();await appendFile(env.GITHUB_OUTPUT,`candidate=${JSON.stringify(candidate)}\n`);
 await repinCandidate(candidate,{npm:env.npm_execpath});
 }else if(command==='transfer'){
 const digest=await transferCandidate(root,path.resolve('inputs'));assert.ok(env.GITHUB_OUTPUT);await appendFile(env.GITHUB_OUTPUT,`record_sha256=${digest}\n`);
 }else if(command==='repin')await restoreCandidate(path.resolve('inputs'),root);
 else throw Error('usage: upstream-drift.mjs resolve|transfer|repin|report');return 0;
}
export function validateDriftTopology(workflow){
 assert.match(workflow,/schedule:\n\s+- cron:/);assert.match(workflow,/permissions:\n  contents: read\n/);
 assert.doesNotMatch(workflow,/continue-on-error|: write|id-token:|git push|git commit|gh (?:issue|pr|release)|npm publish|exit 0|persist-credentials: true|repository:|upstream-source/);
 const jobs={};for(const match of workflow.matchAll(/^  ([a-z][a-z-]+):\n([\s\S]*?)(?=^  [a-z][a-z-]+:\n|$(?![\s\S]))/gm))jobs[match[1]]=match[2];
 for(const name of ['inputs','consumer-build','report']){assert.ok(jobs[name]?.startsWith(`    name: drift-${name}\n`));assert.match(jobs[name],/timeout-minutes: [1-9][0-9]?\n/);}
 const producer=jobs.inputs,consumer=jobs['consumer-build'],report=jobs.report;
 assert.doesNotMatch(producer+consumer,/^\s+if:/m);assert.equal((report.match(/^\s+if:/gm)??[]).length,1);
 assert.match(producer,/npm exec -- node scripts\/upstream-drift.mjs resolve/);assert.match(producer,/npm run --silent registry:inputs -- inputs/);assert.match(producer,/node scripts\/upstream-drift.mjs transfer/);
 assert.match(consumer,/needs: inputs/);assert.match(consumer,/EXPECTED_INPUT_SHA256: \$\{\{ needs.inputs.outputs.record_sha256 \}\}/);assert.match(consumer,/run: node scripts\/check-digest.mjs inputs\/inputs.json EXPECTED_INPUT_SHA256\n/);
 assert.match(consumer,/run: node scripts\/upstream-drift.mjs repin\n/);
 assert.ok(consumer.indexOf('check-digest.mjs')<consumer.indexOf('upstream-drift.mjs repin'));
 for(const cmd of ['npm run build -- --inputs inputs/inputs.json','npm run verify:package -- --inputs inputs/inputs.json'])assert.ok(consumer.split('\n').some(line=>line.trim()===cmd));
 assert.match(report,/needs: \[inputs, consumer-build\]\n    if: always\(\)/);assert.match(report,/run: node scripts\/upstream-drift.mjs report\n/);
 for(const [key,value] of Object.entries({OLD_PAIR:'needs.inputs.outputs.old',CANDIDATE_PAIR:'needs.inputs.outputs.candidate',INPUTS_RESULT:'needs.inputs.result',CONSUMER_RESULT:'needs.consumer-build.result'}))assert.ok(report.includes(`${key}: \${{ ${value} }}`));
 for(const m of workflow.matchAll(/uses: ([^\n]+)/g))assert.match(m[1],/^actions\/[a-z-]+@[a-f0-9]{40}$/);
 assert.equal((workflow.match(/uses: actions\/checkout@/g)??[]).length,(workflow.match(/persist-credentials: false/g)??[]).length);
}
if(process.argv[1] && import.meta.url===pathToFileURL(await realpath(process.argv[1])).href){try{process.exitCode=await main(process.argv[2]);}catch(error){console.error(error);process.exitCode=1;}}
