# Windows test ownership

Source baseline: `Holaxis-ai/superbee@939a630027c4cc4d195e2dd92286efbc7b59455a`.
All paths in the source column are relative to that repository. These are test dispositions, not a
claim that every upstream workspace suite runs here. Native scenarios require the Windows workflow.

`test/migration-cases.json` records all 35 named CLI cases and their exact destination test or
retained upstream protocol test. The ledger test checks local destination references; upstream
rows are checked for path shape only. Their test names must be checked against the pinned upstream
source when updating the input pin. The two original
linear-time backslash probes live in `test/quoting-complexity.test.ts`; three npm-prefix tests retain
their original case names in `test/npm-prefix.test.ts`.

| Source case | New owner and evidence |
| --- | --- |
| core filesystem-lock: Windows lock-claim, stale quarantine, owner-record sharing failures | `test/filesystem.test.ts` pins concrete errno classification; original bounded lock/retry interleavings remain core tests with synthetic policy decisions |
| core filesystem-identity AC-4: Windows replacement sharing failures and durable errors | `test/filesystem.test.ts` pins replacement and open error maps; parent/leaf witness, stale generation and retry-budget cases remain core protocol tests |
| core filesystem lock parent/owner identity | `test/filesystem.test.ts`, stable homedir/AppData/Local and username hash including unavailable-user fallback |
| core native filesystem create/read/CAS | `test/native-adapters.ts`, packed core plus local Windows policy; executed on native Windows only |
| cli host-command: PATH/PATHEXT, cmd relay, absent/unreadable distinction, shell-control rejection | `test/command.test.ts`, original three named tests moved with the adapter and injected shared error class |
| cli command-text: quotes, apostrophes, backslashes, quote terminator family, percent and other expansion refusal | `test/quoting.test.ts`; native PowerShell/cmd token execution in `test/native-adapters.ts` |
| cli hook-compatibility Windows generated lexical envelope and exact round-trip | `test/quoting.test.ts` |
| cli install-authority/invocation npm prefix, scoped layout, known shim ownership | `test/host.test.ts`; actual renamed npm shim plus forged extra-command refusal in installed `renamed-distribution` scenario |
| cli user-state-platform-policy: LOCALAPPDATA drive/UNC acceptance, relative/device refusal, guarded roots and displays | `test/private-state.test.ts` |
| cli user-state migration sources: precedence and required markers | `test/private-state.test.ts`; shared migration journal/CAS/replay tests stay first-party |
| cli private-config-write Windows inherited ACL/no-chmod and bounded sharing predicate | `test/private-state.test.ts` pins no-mode/inspect-before-open/EPERM+EBUSY; shared atomic replace bounds and mutation protocol stay first-party |
| cli native user-state readable agreement and root junction refusal | installed `private-state-and-pipe` scenario exercises real known-folder state, harden status, junction refusal and untouched target |
| cli native marker/child junction refusal | Installed `private-state-and-pipe` also replaces the state marker with a junction, then creates a real View approval and proves a junctioned approval directory cannot authorize a fresh View launch; foreign bytes survive |
| cli host-config and MCP Windows appdata path | `test/host.test.ts` path fact, installed `renamed-distribution` checks user skill/hook files for all host conventions, and `mcp-config-lifecycle` checks desktop configuration |
| cli additional anonymous stdin pipe classification | `test/host.test.ts` applicability and installed `private-state-and-pipe` scenario with real piped bytes |
| cli recipe-evolve exact native command continuation | installed `recipe-exact-apply` recreates the original recipe update, executes the emitted command character-for-character through cmd.exe with the launcher absent from PATH, and reads back the convention change |
| board Windows physical comparison and move-aside help | `test/host.test.ts` plus `test/native-adapters.ts` executes emitted PowerShell remedy verbatim on apostrophe-bearing directory |
| board foreign-worktree provision/refusal transaction | Shared ownership proof remains core/board; destination local remote sync covers installed board composition, not all upstream Git transaction tests |
| scripts verify-npm-package Windows quoting, LOCALAPPDATA expectation and `.cmd` resolver | quoting/private-state/host tests above; installed workflow proves exact prefix `.cmd`, read-back and first-party bin preservation |
| scripts windows-installed-package-proof: all five native lifecycle scenarios | `scripts/windows-installed-package-proof.mjs`: catalog, local remote sync, UI URL, managed document/Chrome/worker, MCP lifecycle preserved and adapted to installed renamed entry |
| scripts workflow-ci-topology Windows proof digest and scenario bypass mutations | `test/topology.test.mjs`, `scripts/ci-contract.mjs`, `test/native-proof.json`: byte digest, mandatory calls, producer/input/hash/install boundaries and red probes |
| windows-support-probe historical monorepo inventory | Retired: this repo proves its adapters and installed workflows, not every upstream workspace. Native prerequisites are hard failures and unit skip counts remain visible |

Independent validation still needs the actual candidate CLI/core artifacts and native workflow.
The shared protocol tests must remain in their owning repository; removing their concrete Windows
branch is not permission to remove the protocol interleaving coverage.
