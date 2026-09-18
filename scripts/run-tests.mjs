import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export async function runTests(directory=root,run=spawnSync) {
 const files=(await readdir(path.join(directory,'test'),{withFileTypes:true}))
  .filter(entry=>entry.isFile() && /\.test\.(?:ts|mjs)$/.test(entry.name))
  .map(entry=>'test/'+entry.name).sort();
 assert.ok(files.length,'no test files discovered');
 // Explicit argv works on Node 20 through cmd.exe as well as POSIX shells.
 const result=run(process.execPath,['--test','--import','./test/register.mjs',...files],{cwd:directory,stdio:'inherit'});
 if(result.error)throw result.error;
 if(result.signal)console.error(`Test process terminated by ${result.signal}`);
 return result.status ?? 1;
}
if(process.argv[1] && import.meta.url===pathToFileURL(await realpath(process.argv[1])).href) process.exitCode=await runTests();
