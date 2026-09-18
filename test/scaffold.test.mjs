import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
test('staging package owns one distinct bin and has no release lifecycle',async()=>{
 const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
 assert.equal(pkg.private,true);assert.equal(pkg.version,'0.0.0');
 assert.deepEqual(pkg.bin,{'superbee-windows':'dist/superbee-windows.mjs'});
 assert.deepEqual(pkg.os,['win32']);assert.equal(pkg.dependencies,undefined);
});
