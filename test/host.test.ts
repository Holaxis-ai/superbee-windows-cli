import assert from 'node:assert/strict';
import test from 'node:test';
import { npmPrefixInvocation, npmGlobalPaths, shimTargetsExecutable, isStableRuntimePair, createWindowsHostCommands } from '../src/host.js';
import { windowsBoardHostPolicy } from '../src/board.js';
const layout={packageName:'@superbee/windows-cli',entryRelativePath:'dist/superbee-windows.mjs',bins:['superbee-windows']};
const executable=String.raw`C:\npm\node_modules\@superbee\windows-cli\dist\superbee-windows.mjs`;
const runtime=String.raw`C:\Program Files\nodejs\node.exe`;
const shim=String.raw`C:\npm\superbee-windows.cmd`;

test('renamed npm layout installs only its own bin and exact scoped entry',()=>{
  assert.deepEqual(npmGlobalPaths('C:\\npm',layout),{executable,binDirectory:'C:\\npm'});
  assert.equal(isStableRuntimePair(runtime.replaceAll('\\','/'),executable.replaceAll('\\','/'),layout),true);
  assert.equal(isStableRuntimePair(runtime.replaceAll('\\','/'),'C:/npm/node_modules/superbee/dist/superbee.mjs',layout),false);
});
test('Windows npm prefix probe binds npm CLI to already running Node and refuses redirected/npm-exec targets',()=>{
  const npm=String.raw`C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js`;
  const resolve=(value:string)=>[runtime,npm].includes(value)?value:undefined;
  assert.deepEqual(npmPrefixInvocation(runtime,resolve),{command:runtime,args:[npm,'prefix','--global']});
  assert.equal(npmPrefixInvocation('C:\\_npx\\node.exe',v=>v),undefined);
  assert.equal(npmPrefixInvocation(runtime,v=>v===npm?'C:\\foreign\\npm-cli.js':v),undefined);
});
test('Windows cmd-shim ownership rejects extra commands and foreign layouts',()=>{
  const direct=`@echo off\r\n"${runtime}" "${executable}" %*\r\n`;
  assert.equal(shimTargetsExecutable(direct,shim,executable,runtime,[layout]),true);
  assert.equal(shimTargetsExecutable(direct+'echo extra\r\n',shim,executable,runtime,[layout]),false);
  const npmShim='@ECHO off\r\ngoto start\r\n:find_dp0\r\nSET dp0=%~dp0\r\nEXIT /b\r\n:start\r\nSETLOCAL\r\nCALL :find_dp0\r\nIF EXIST "%dp0%\\node.exe" (\r\n  SET "_prog=%dp0%\\node.exe"\r\n) ELSE (\r\n  SET "_prog=node"\r\n  SET PATHEXT=%PATHEXT:;.JS;=;%\r\n)\r\nendLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\node_modules\\@superbee\\windows-cli\\dist\\superbee-windows.mjs" %*\r\n';
  assert.equal(shimTargetsExecutable(npmShim,shim,executable,runtime,[layout],()=>executable),true);
  assert.equal(shimTargetsExecutable(npmShim+'echo extra\n',shim,executable,runtime,[layout],()=>executable),false);
  assert.equal(shimTargetsExecutable(npmShim,shim,executable,runtime,[{...layout,packageName:'superbee'}],()=>executable),false);
});
test('Windows board comparison and safe move guidance retain native spellings',()=>{
  assert.equal(windowsBoardHostPolicy.sameResolvedPath('C:\\Repo\\.superbee','c:\\repo\\.superbee'),true);
  assert.equal(windowsBoardHostPolicy.sameResolvedPath('C:\\Repo','C:\\Other'),false);
  assert.equal(windowsBoardHostPolicy.moveAsideHelp("C:\\repo\\owner's board",'ignored'),`powershell.exe -NoProfile -NonInteractive -Command "$ErrorActionPreference='Stop'; Rename-Item -LiteralPath 'C:\\repo\\owner''s board' -NewName 'owner''s board.bak' -ErrorAction Stop"`);
});
test('anonymous pipe applicability never admits character devices or directories',()=>{
  class ErrorType extends Error {constructor(readonly state:'absent'|'unreadable',message:string){super(message);}}
  const host=createWindowsHostCommands(ErrorType);
  for(const [character,directory] of [[false,false],[true,false],[false,true]]) assert.equal(host.hasAdditionalStdinInput({isCharacterDevice:()=>character!,isDirectory:()=>directory!}),!character&&!directory);
});

test('Windows host config and PATH facts retain native conventions',()=>{
  class ErrorType extends Error {constructor(readonly state:'absent'|'unreadable',message:string){super(message);}}
  const host=createWindowsHostCommands(ErrorType);
  assert.equal(host.claudeDesktopConfigPath('C:\\profile',{APPDATA:'D:\\redirected'}),'D:\\redirected\\Claude\\claude_desktop_config.json');
  assert.equal(host.claudeDesktopConfigPath('C:\\profile',{}),undefined);
  assert.deepEqual(host.executableCandidates('C:\\npm','superbee-windows',{PATHEXT:'.EXE;.CMD'}),['C:\\npm\\superbee-windows.EXE','C:\\npm\\superbee-windows.CMD']);
  assert.equal(host.comparisonKey('C:/Users/Mike'),host.comparisonKey('c:\\users\\mike'));
});
