import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, rm, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createFilesystemRuntime } from '@superbee/core/filesystem';
import { createWindowsFilesystemHostPolicy } from '../src/filesystem.js';
import { windowsBoardHostPolicy } from '../src/board.js';
import { renderWindowsToken } from '../src/quoting.js';
assert.equal(process.platform,'win32','native adapter evidence requires Windows');
const root=await mkdtemp(path.join(tmpdir(),'windows-native-adapter-'));
try {
 const runtime=createFilesystemRuntime(createWindowsFilesystemHostPolicy());
 const bundle=path.join(root,'bundle');await runtime.initBundle(bundle,{okfVersion:'0.2'});
 const a=runtime.backend(bundle),b=runtime.backend(bundle);
 const document={id:'notes/native',frontmatter:{type:'Note',title:'Native'},body:'first'};
 const version=await a.write(document.id,document);
 const read=await b.read(document.id);assert.equal(read.version,version);
 await b.write(document.id,{...document,body:'second'},{expectedVersion:version});
 await assert.rejects(a.write(document.id,{...document,body:'stale'},{expectedVersion:version}));
 assert.equal((await a.read(document.id)).doc.body.trim(),'second');
 const foreign=path.join(root,"owner's foreign board");await mkdir(foreign);await writeFile(path.join(foreign,'untouched.txt'),'preserved');
 const remedy=windowsBoardHostPolicy.moveAsideHelp(foreign,'ignored');
 const powershell=path.join(process.env.SystemRoot ?? 'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
 execFileSync(powershell,['-NoProfile','-NonInteractive','-Command',remedy],{cwd:root,stdio:'pipe',timeout:30_000});
 await assert.rejects(lstat(foreign),{code:'ENOENT'});
 assert.equal(await readFile(path.join(foreign+'.bak','untouched.txt'),'utf8'),'preserved');
 // Execute the exact emitted characters in both native shell families, preserving a benign token.
 const probe=path.join(root,'argv.mjs');await writeFile(probe,"process.stdout.write(JSON.stringify(process.argv.slice(2)))");
 const token=renderWindowsToken("owner's notes");assert.ok(token);
 const script=`& '${process.execPath.replaceAll("'","''")}' '${probe.replaceAll("'","''")}' ${token}`;
 assert.deepEqual(JSON.parse(execFileSync(powershell,['-NoProfile','-NonInteractive','-Command',script],{encoding:'utf8',timeout:30_000})),["owner's notes"]);
 const command=`""${process.execPath}" "${probe}" ${token}"`;
 const echoed=spawnSync(process.env.ComSpec ?? 'cmd.exe',['/d','/s','/c',command],{encoding:'utf8',windowsVerbatimArguments:true,timeout:30_000});
 assert.ifError(echoed.error);assert.equal(echoed.status,0,echoed.stderr);
 assert.deepEqual(JSON.parse(echoed.stdout),["owner's notes"]);
 process.stdout.write(JSON.stringify({platform:process.platform,scenarios:['standalone-core-cas','verbatim-board-remedy','native-shell-token']})+'\n');
} finally {await rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
