import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const ledger=JSON.parse(await readFile(new URL('./migration-cases.json',import.meta.url),'utf8'));
test('every transplanted CLI case names an existing destination proof or retained shared protocol',async()=>{
  assert.equal(ledger.cases.length,35);
  for(const row of ledger.cases) {
    assert.ok(row.source_file&&row.source_case&&row.target_file&&row.target_case);
    if(row.owner==='upstream') {
      assert.ok(row.target_file.startsWith('packages/cli/test/'));
      continue;
    }
    assert.equal(row.owner,'windows');
    const source=await readFile(new URL('../'+row.target_file,import.meta.url),'utf8');
    assert.ok(source.includes(row.target_case),row.source_case+' lost its destination case');
  }
});
