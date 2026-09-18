#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { createCliRuntime, HostCommandError, type StaticBuildIdentity } from '@superbee/cli';
import { windowsFilesystemHostPolicy } from './filesystem.js';
import { windowsPrivateStateHost } from './private-state.js';
import { windowsBoardHostPolicy } from './board.js';
import { createWindowsHostCommands } from './host.js';

declare const WINDOWS_BUILD_IDENTITY: StaticBuildIdentity;
const argv=process.argv.slice(2);
if (['--version','-v','-V'].includes(argv[0] ?? '')) {
  process.stdout.write(WINDOWS_BUILD_IDENTITY.package.version+'\n');
} else if (process.platform !== 'win32' && argv[0] !== 'version') {
  process.stdout.write(JSON.stringify({error:{code:'RUNTIME',message:'This experimental distribution requires native Windows.'}})+'\n');
  process.exitCode=1;
} else {
  const executablePath=fileURLToPath(import.meta.url);
  const runtime=createCliRuntime({
    distribution:{identity:WINDOWS_BUILD_IDENTITY,executablePath,assetRoot:dirname(dirname(executablePath)),
      install:{packageName:'@superbee/windows-cli',entryRelativePath:'dist/superbee-windows.mjs',bins:['superbee-windows']},
      predecessorLayouts:[],ownedSkillPackages:['@superbee/windows-cli'],updatesEnabled:false},
    filesystemHost:windowsFilesystemHostPolicy,privateState:windowsPrivateStateHost,boardHost:windowsBoardHostPolicy,
    host:createWindowsHostCommands(HostCommandError),
  });
  if(argv[0]==='__managed-ui-v1') {
    if(argv.length===1) await runtime.runManagedUiWorker();
  } else if(argv[0]==='__update-refresh-v1') {
    // This unpublished distribution never starts an update worker.
  } else await runtime.run(argv);
}
