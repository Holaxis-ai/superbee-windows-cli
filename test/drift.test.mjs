import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { resolveCandidate, assessDrift, validateDriftTopology, transferCandidate, restoreCandidate, repinCandidate } from '../scripts/upstream-drift.mjs';
import { readLockedPackages, root } from '../scripts/registry-inputs.mjs';
const old=(await readLockedPackages()).packages,candidate=structuredClone(old);candidate[0].version='1.2.3';candidate[0].resolved='https://registry.npmjs.org/@superbee/cli/-/cli-1.2.3.tgz';
test('resolver freezes each next tag once without choosing a different matching pair',async()=>{
 let calls=0;const pair=await resolveCandidate(async url=>{const row=candidate[calls++];assert.equal(url,`https://registry.npmjs.org/${row.name}/next`);return JSON.stringify({name:row.name,version:row.version,dist:{tarball:row.resolved,integrity:row.integrity}});});assert.equal(calls,2);assert.deepEqual(pair,candidate);
 for(const data of [{}, {name:'@superbee/cli',version:'next'}, {name:'wrong',version:'1.2.3'}])await assert.rejects(resolveCandidate(async()=>JSON.stringify(data)));
 await assert.rejects(resolveCandidate(async()=>{throw Error('offline');}),/offline/);
});
test('only identical pins with both successful build stages are green; integrity drift stays red',()=>{
 assert.equal(assessDrift(old,old,'success','success').ok,true);assert.equal(assessDrift(old,candidate,'success','success').ok,false);
 const changed=structuredClone(old);changed[0].integrity='sha512-'+Buffer.alloc(64).toString('base64');assert.equal(assessDrift(old,changed,'success','success').ok,false);
 for(const status of ['failure','cancelled','skipped','',undefined]){assert.equal(assessDrift(old,old,status,'success').ok,false);assert.equal(assessDrift(old,old,'success',status).ok,false);}
 assert.equal(assessDrift(null,old,'success','success').ok,false);
});
test('candidate manifests transfer with hashes and changed lock bytes refuse repin',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'candidate-'));try{
 const out=path.join(dir,'inputs'),dest=path.join(dir,'dest');await mkdir(out);await mkdir(dest);
 await writeFile(path.join(out,'inputs.json'),JSON.stringify(await readLockedPackages()));await transferCandidate(root,out);await restoreCandidate(out,dest);
 assert.equal(await readFile(path.join(dest,'package-lock.json'),'utf8'),await readFile(path.join(root,'package-lock.json'),'utf8'));
 await writeFile(path.join(out,'package-lock.json'),'changed');await assert.rejects(restoreCandidate(out,dest),/bytes changed/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('report propagates red/green process exits and safe unavailable resolution',async()=>{
 for(const [pair,producer,consumer,status] of [[old,'success','success',0],[candidate,'success','success',1],[null,'failure','skipped',1],[old,'success','cancelled',1]]){
 const result=spawnSync(process.execPath,['scripts/upstream-drift.mjs','report'],{encoding:'utf8',env:{...process.env,OLD_PAIR:JSON.stringify(old),CANDIDATE_PAIR:JSON.stringify(pair),INPUTS_RESULT:producer,CONSUMER_RESULT:consumer}});assert.equal(result.status,status,result.stderr);if(!pair)assert.match(result.stdout,/unavailable/);
 }
});
const workflow=await readFile(new URL('../.github/workflows/upstream-drift.yml',import.meta.url),'utf8');
test('drift workflow freezes candidates and always reports after separate build attempt',()=>validateDriftTopology(workflow));
test('drift workflow bypass mutations fail closed',()=>{
 for(const [from,to] of [['contents: read','contents: write'],['name: drift-inputs','name: inputs'],['persist-credentials: false','persist-credentials: true'],['npm exec -- node scripts/upstream-drift.mjs resolve','echo skipped-resolve'],['npm run --silent registry:inputs','echo skipped-producer'],['node scripts/upstream-drift.mjs transfer','echo skipped-transfer'],['npm run build -- --inputs inputs/inputs.json','echo skipped-build'],['node scripts/upstream-drift.mjs report','echo skipped-report'],['if: always()','if: success()'],['needs: [inputs, consumer-build]','needs: inputs'],['needs: inputs','needs: inputs\n    if: false'],['node scripts/check-digest.mjs inputs/inputs.json EXPECTED_INPUT_SHA256','echo unchecked'],['node scripts/upstream-drift.mjs repin','echo skipped-repin'],['timeout-minutes: 20','timeout-minutes: 0']]){assert.ok(workflow.includes(from),from);assert.throws(()=>validateDriftTopology(workflow.replace(from,to)),from);}
 for(const extra of ['\n# continue-on-error: true','\n# git push','\n# gh issue create'])assert.throws(()=>validateDriftTopology(workflow+extra));
});

test('unresolved report runs without installed dependencies or registry network',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'drift-report-bootstrap-'));try{
 await mkdir(path.join(dir,'scripts'));for(const name of ['upstream-drift.mjs','registry-lock.mjs'])await writeFile(path.join(dir,'scripts',name),await readFile(new URL('../scripts/'+name,import.meta.url)));
 const result=spawnSync(process.execPath,[path.join(dir,'scripts/upstream-drift.mjs'),'report'],{encoding:'utf8',env:{...process.env,OLD_PAIR:'',CANDIDATE_PAIR:'',INPUTS_RESULT:'failure',CONSUMER_RESULT:'skipped'}});
 assert.equal(result.status,1,result.stderr);assert.match(result.stdout,/Resolution missing or invalid/);assert.match(result.stdout,/unavailable/);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('integrity-only repin regenerates candidate lock rows from exact frozen versions',async()=>{
 const {readFileSync,writeFileSync}=await import('node:fs');
 const dir=await mkdtemp(path.join(tmpdir(),'drift-integrity-'));try{
 const manifest=await readFile(path.join(root,'package.json')),original=JSON.parse(await readFile(path.join(root,'package-lock.json'),'utf8'));
 await writeFile(path.join(dir,'package.json'),manifest);await writeFile(path.join(dir,'package-lock.json'),JSON.stringify(original));
 const frozen=structuredClone(old);frozen[0].integrity='sha512-'+Buffer.alloc(64).toString('base64');let calls=0;
 await repinCandidate(frozen,{directory:dir,npm:'npm-cli.js',run:(exe,args,options)=>{
 calls++;assert.equal(exe,process.execPath);assert.ok(args.includes('--prefer-online'));assert.ok(args.includes('--ignore-scripts'));assert.ok(!args.includes('next'));
 const pending=JSON.parse(readFileSync(path.join(dir,'package-lock.json'))),pkg=JSON.parse(readFileSync(path.join(dir,'package.json')));
 for(const row of frozen){assert.equal(pending.packages['node_modules/'+row.name],undefined);assert.equal(pkg.devDependencies[row.name],row.version);pending.packages['node_modules/'+row.name]={...original.packages['node_modules/'+row.name],version:row.version,resolved:row.resolved,integrity:row.integrity};pending.packages[''].devDependencies[row.name]=row.version;}
 writeFileSync(path.join(dir,'package-lock.json'),JSON.stringify(pending));
 }});assert.equal(calls,1);
 }finally{await rm(dir,{recursive:true,force:true});}
});
