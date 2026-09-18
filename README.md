# Superbee for Windows

This experimental distribution supplies Windows filesystem, shell, private-state, and Git board
adapters to Superbee's shared command runtime. Knowledge stays in ordinary OKF markdown bundles;
parsing, versioned writes, and conflict handling remain owned by the shared engine.

This is an experimental native Windows executable with no first-party support promise and no
maintainer commitment. Most Windows users should use the standard Superbee CLI in WSL2.
There is no `@superbee/windows-cli` npm release or downloadable GitHub Release tarball; this
repository is for building from source. The package remains private at version `0.0.0` to prevent
accidental npm publication.

Native Windows compatibility is established only by a passing Windows distribution proof run
for the exact source and package hashes shown in that run. Local adapter tests and the scheduled
upstream drift check do not establish native compatibility.

The executable is `superbee-windows`, including npm's `superbee-windows.cmd` launcher. It does not
install or replace `superbee`. Existing Superbee integration receipts are foreign to this experimental
distribution; they are not adopted automatically. Automatic update checks are disabled. Existing
bundle formats and private-state namespace names remain unchanged.

## Planned user build (pending @superbee/cli publish)

These steps are planned, not available yet. They depend on publication of `@superbee/cli` and
completion of the registry-pinned build work (W2 part 2). After that work, a clone of this repository
on Windows with Node.js 20 or newer will install exact registry dependencies and build locally:

```sh
# Planned only; pending @superbee/cli publish and W2 part 2.
npm ci
npm run build
```

Today, `npm run build` requires the explicit package inputs described below. Running the planned
commands now does not produce a usable build. No package publication or release download is planned
for this Windows executable.

## Current maintainer build from explicit package inputs

Install Node.js 20 or newer. The pinned toolchain and adapter tests can run on macOS or Linux;
native runtime tests require Windows.

```sh
npm ci --ignore-scripts --force
npm test
npm run build -- --inputs /absolute/path/to/inputs.json
npm run typecheck
npm run verify:package -- --inputs /absolute/path/to/inputs.json
```

`--force` permits installing this Windows-only package's development tools on another host. It does
not make the Windows executable support that host. The input record must name the exact reviewed
upstream commit in `upstream-input.json`, the source lockfile hash, tool versions, and the names,
versions, filenames, and SHA-256 digests of packed `@superbee/cli` and `@superbee/core`. The tarballs
sit beside `inputs.json`; missing pins or changed bytes fail before a build.

To produce those inputs, a maintainer needs a clean checkout of `Holaxis-ai/superbee` at the exact
commit in `upstream-input.json`, with access to that repository and its dependencies. Run this
command from the Windows repository, passing the upstream checkout and an output directory:

```sh
npm run produce:inputs -- /absolute/path/to/upstream-checkout /absolute/path/to/inputs
```

The producer builds upstream and packs `@superbee/cli` and `@superbee/core`; its output directory
contains `inputs.json` and both tarballs. The consumer commands above use that `inputs.json`.
This producer/consumer path is the current maintainer workflow, not the pending registry build.

The build consumes public package exports. It obtains the skill and reference resources from
`@superbee/cli/resources` and bundles the CLI into one executable with zero runtime dependencies.
The artifact remains a local development build, with its source identity reported honestly.
No upstream checkout, source alias, workspace link, or source copy participates in this consumer
build. Generated tarballs, resources, and build outputs are not committed.

## Filesystem adapter without CLI startup

```js
import { createFilesystemRuntime } from '@superbee/core/filesystem';
import { windowsFilesystemHostPolicy } from '@superbee/windows-cli/filesystem';

const filesystem = createFilesystemRuntime(windowsFilesystemHostPolicy);
const bundle = await filesystem.initBundle('C:/work/project/.superbee');
```

The filesystem export has no CLI runtime import and performs no work on import. Install a
compatible packed core alongside it; the external consumer proof checks the published TypeScript
contract without skipping declaration checks. Core owns the filesystem backend, lock protocol,
witness checks, and retry bounds. This adapter supplies Windows-specific observations.

## Verification

The workflow has three stages: a pinned upstream source job produces the package tarballs; a
separate job checks out this repository and builds only from those tarballs; a Windows job installs
and drives the exact resulting artifact on Node 20. The Windows job also exercises standalone core
CAS, verbatim PowerShell board recovery, and shell-token behavior. Its installed scenarios cover
catalog operations, local Git sharing, UI lifecycle, managed workers and Chrome rendering, MCP
registration, renamed executable ownership, foreign-receipt refusal, private-state junction
refusal, anonymous pipe input, and exact recipe continuation commands executed by cmd.exe.
Native tests fail when prerequisites are missing.

`test/native-proof.json` binds the reviewed installed proof bytes and scenario inventory. After
reviewing an intentional proof change, run `node scripts/native-proof-digest.mjs` and update that
record in the same commit. `TEST-MIGRATION.md` maps prior Windows tests to their new owners.

First-party Superbee releases do not depend on this repository's CI or package publication.

## Upstream drift

The separate weekly Upstream drift workflow resolves upstream `main` once to an immutable commit,
temporarily repins disposable checkouts, and attempts package production and a separate consumer
build. The summary reports the old pin, candidate, and each build result. A stale pin reports red
even if the candidate builds; a current pin reports green only when both stages succeed. Resolution,
network, and build failures report red. This check does not update the committed pin, push a branch,
open an issue, publish packages, or gate first-party releases. Any accepted repin requires review
and the existing Windows distribution proof.

## Security

Use the private reporting route in [SECURITY.md](SECURITY.md) for suspected vulnerabilities.
