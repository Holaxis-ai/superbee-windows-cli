import { isMain } from './is-main.mjs';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
export function extractReadmeBuild(text) {
 const start='<!-- windows-build:start -->',end='<!-- windows-build:end -->';
 assert.equal(text.split(start).length,2,'exactly one build start required');assert.equal(text.split(end).length,2,'exactly one build end required');
 const a=text.indexOf(start)+start.length,b=text.indexOf(end);assert.ok(a<b);
 const match=/^\r?\n```powershell\r?\n([\s\S]+?)```\r?\n$/.exec(text.slice(a,b));assert.ok(match,'build block must be a single powershell fence');
 assert.ok(match[1].trim() && !match[1].includes('```'),'empty or nested build block');return match[1];
}
if(await isMain(import.meta.url)){
 assert.equal(process.argv.length,3,'usage: extract-readme-build.mjs output.ps1');await writeFile(process.argv[2],extractReadmeBuild(await readFile(new URL('../README.md',import.meta.url),'utf8')));
}
