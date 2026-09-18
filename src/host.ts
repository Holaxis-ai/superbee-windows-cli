import { spawn } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { win32 as paths } from 'node:path';
import type { DistributionInstallLayout, HostCommands } from '@superbee/cli';
import { sameResolvedPath } from './board.js';
import { createWindowsCommandOperations, type HostCommandErrorConstructor } from './command.js';
import { lexicalHookTokens, renderGeneratedHookToken, renderWindowsToken } from './quoting.js';

function realOrUndefined(value: string): string | undefined {
  try { return realpathSync(value); } catch { return undefined; }
}
function containsNpxCache(value: string): boolean {
  return value.split(/[\\/]/).some(part => part.toLowerCase() === '_npx');
}
export function npmPrefixInvocation(runtimePath: string, realpath: (candidate: string) => string | undefined) {
  if (!paths.isAbsolute(runtimePath) || containsNpxCache(runtimePath)) return undefined;
  const runtime = realpath(paths.normalize(runtimePath));
  if (!runtime || !paths.isAbsolute(runtime) || containsNpxCache(runtime) || paths.basename(runtime).toLowerCase() !== 'node.exe') return undefined;
  const expected = paths.join(paths.dirname(runtime), 'node_modules','npm','bin','npm-cli.js');
  const npmCli = realpath(expected);
  if (!npmCli || !paths.isAbsolute(npmCli) || containsNpxCache(npmCli) || paths.normalize(npmCli).toLowerCase() !== expected.toLowerCase()) return undefined;
  return {command:runtime,args:[npmCli,'prefix','--global']};
}
export function npmGlobalPaths(prefix: string, layout: DistributionInstallLayout) {
  return {executable:paths.join(prefix,'node_modules',...layout.packageName.split('/'),...layout.entryRelativePath.split('/')),binDirectory:prefix};
}
export function executableCandidates(directory: string, name: string, env: NodeJS.ProcessEnv): readonly string[] {
  return (env.PATHEXT?.trim() || '.COM;.EXE;.BAT;.CMD').split(';').map(v => v.trim()).filter(Boolean)
    .map(value => paths.join(directory,`${name}${value.startsWith('.') ? value : `.${value}`}`));
}

/** Match only an exact direct launcher or the known npm cmd-shim grammar. */
export function shimTargetsExecutable(source: string, candidate: string, executable: string,
  runtimePath: string, layouts: readonly DistributionInstallLayout[], realpath = realOrUndefined): boolean {
  const fold = (value: string) => value.replaceAll('\\','/').toLowerCase();
  const lines = source.replaceAll('\r\n','\n').split('\n').map(line => line.trim()).filter(Boolean);
  const direct = ['@echo off',`"${runtimePath}" "${executable}" %*`];
  if (fold(lines.join('\n')) === fold(direct.join('\n'))) return true;
  return layouts.some(layout => {
    const parts = ['node_modules',...layout.packageName.split('/'),...layout.entryRelativePath.split('/')];
    const target = realpath(paths.join(paths.dirname(candidate),...parts));
    if (!target || !sameResolvedPath(target,executable)) return false;
    const token = `%dp0%\\${parts.join('\\')}`;
    const fixedLines = [
      /^@echo off$/i, /^goto start$/i, /^:find_dp0$/i, /^set dp0=%~dp0$/i, /^exit \/b$/i,
      /^:start$/i, /^setlocal$/i, /^call :find_dp0$/i, /^if exist "%dp0%\\node\.exe" \($/i,
      /^set "_prog=%dp0%\\node\.exe"$/i, /^\) else \($/i, /^set "_prog=node"$/i,
      /^set pathext=%pathext:;\.js;=;%$/i, /^\)$/,
    ];
    const final = new RegExp(`^endlocal & goto #_undefined_# 2>nul \\|\\| title %comspec% & "%_prog%"\\s+"${token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}" %\\*$`,'i');
    return lines.every(line => fixedLines.some(pattern => pattern.test(line)) || final.test(line)) && lines.some(line => final.test(line));
  });
}
export function isCanonicalAbsolutePath(value: string): boolean {
  return paths.isAbsolute(value) && paths.normalize(value).replaceAll('\\','/') === value;
}
export function isStableRuntimePair(program: string, executable: string, layout: DistributionInstallLayout): boolean {
  if (!isCanonicalAbsolutePath(program) || !isCanonicalAbsolutePath(executable) || !/\/node\.exe$/i.test(program)) return false;
  const suffix = `/node_modules/${layout.packageName}/${layout.entryRelativePath}`;
  return executable.toLowerCase().endsWith(suffix.toLowerCase());
}

export function createWindowsHostCommands(ErrorType: HostCommandErrorConstructor): HostCommands {
  const host: HostCommands = {
    id:'win32', paths,
    comparisonKey:(value:string) => paths.normalize(value).toLowerCase(),
    claudeDesktopConfigPath:(_home:string,env:NodeJS.ProcessEnv) => env.APPDATA ? paths.join(env.APPDATA,'Claude','claude_desktop_config.json') : undefined, ...createWindowsCommandOperations(ErrorType),
    renderShellToken:renderWindowsToken, renderGeneratedHookToken, lexicalHookTokens, sameResolvedPath,
    npmPrefixInvocation, npmGlobalPaths, executableCandidates,
    installedBinPath:(prefixBin:string,name:string) => paths.join(prefixBin,`${name}.cmd`),
    binMatches:(candidate:string,_resolved:string,executable:string,runtimePath:string,layouts:readonly DistributionInstallLayout[]) => {
      if (!candidate.toLowerCase().endsWith('.cmd')) return false;
      try { return shimTargetsExecutable(readFileSync(candidate,'utf8'),candidate,executable,runtimePath,layouts); } catch { return false; }
    },
    stableRuntimePath:(_prefixBin:string,runtime:string) => runtime,
    isCanonicalAbsolutePath, isNodeRuntimePath:(value:string) => /(?:^|[\\/])node\.exe$/i.test(value), isStableRuntimePair,
    hasAdditionalStdinInput:(stats) => !stats.isCharacterDevice() && !stats.isDirectory(),
    openBrowser:(url:string) => {
      try { const child=spawn('cmd',['/c','start','',url],{stdio:'ignore',detached:true}); child.once('error',()=>{}); child.unref(); } catch { /* Browser launch is best-effort; the printed URL remains usable. */ }
    },
    spawnChild:(file,args,options) => spawn(file,[...args],{...options,windowsHide:true}),
  };
  return Object.freeze(host);
}
