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

## Build on Windows

Install git, npm and Node.js 20.17 or newer within Node 20, or Node.js 22.9 or newer
(`^20.17.0 || >=22.9.0`). Clone this repository and open PowerShell in its root directory.
The build needs network access to the public npm registry, GitHub attestation API and Sigstore
trust service. It needs no upstream checkout, GitHub CLI or global verification tool.

Run this block exactly. Each guard stops PowerShell immediately if a native command fails.
CI extracts this block from the README and executes it on Windows.

<!-- windows-build:start -->
```powershell
npm ci
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm run verify:package
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
```
<!-- windows-build:end -->

The build pins `@superbee/cli@0.1.0-pre.1` and `@superbee/core@0.2.0-pre.6` in the npm lockfile.
Before executing CLI resources, typechecking or bundling, it checks tarball integrity, verifies
the CLI release's Sigstore attestation and workflow/source identity, compares every installed
package file against the verified tarballs, and checks the embedded v2 core identity. Missing
attestation, changed installed bytes, mismatched core or unavailable trust verification fails
the build and removes prior output receipts.

After the build, install the locally packed executable from this repository root:

```powershell
npm install --global ./out/superbee-windows-cli-0.0.0.tgz --ignore-scripts
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
superbee-windows --version
```

This tarball is your local development output, not a distributed release. The executable reports
version `0.0.0` and records the local source identity. Run `superbee-windows --help` for commands.

For development on macOS or Linux, use `npm ci --force`, then `npm test`, `npm run build`,
`npm run typecheck` and `npm run verify:package`. `--force` permits installing development tools;
it does not expand native Windows support. The build consumes public package exports, obtains
resources from `@superbee/cli/resources`, and bundles a CLI with zero runtime dependencies.
Generated tarballs, resources and build outputs are ignored.

CI can transfer explicit inputs with `npm run registry:inputs -- /absolute/output/directory`,
then run `npm run build -- --inputs /absolute/output/directory/inputs.json` and
`npm run verify:package -- --inputs /absolute/output/directory/inputs.json`. The receiver checks
its own lockfile, tarball bytes and signed evidence again. No-argument package verification uses
the successful build's input receipt.

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

The workflow retains `inputs`, `consumer-build` and `native-installed`: registry inputs are verified,
a separate consumer builds from the locked packages, and Windows installs and drives the exact
resulting artifact on Node 20. `native-readme-build` independently checks out this repository, runs
the exact README block, and proves its own resulting tarball. Native jobs also exercise standalone core
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

The separate weekly Upstream drift workflow resolves each package's `next` tag once to an exact
version and integrity, temporarily repins disposable checkouts, and attempts a separate consumer
build using the exact candidate manifest and lock bytes. The summary reports the old pair, candidate
pair, integrity and each build result. A stale pin reports red
even if the candidate builds; a current pin reports green only when both stages succeed. Resolution,
network, and build failures report red. This check does not update the committed pin, push a branch,
open an issue, publish packages, or gate first-party releases. Any accepted repin requires review
and the existing Windows distribution proof.

## Security

Use the private reporting route in [SECURITY.md](SECURITY.md) for suspected vulnerabilities.
