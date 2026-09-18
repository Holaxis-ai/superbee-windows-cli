# Windows distribution contributor guide

This repository owns experimental Windows adapters and the `superbee-windows` executable.
Shared command and engine implementations are consumed through exact packed package exports.
Do not copy them here, add upstream source aliases, or add this repository to first-party release
gates. There is no npm publication workflow. Keep `private: true` until a human release decision.

For technical sessions load the Superbee, holaxis-self-awareness, and holaxis-cognitive-ecosystem
skills. Ask the maintainer or orchestrator for the selected shared project bundle and owning task;
use `superbee --dir` with that selected bundle. Read `docs/core` and the task, record a proximate
goal, and use the bundle for task, context, and review records. Do not guess a bundle location or
create a replacement task store. Dispatched builders must not sync or push.

The source of test migration is Superbee baseline
`939a630027c4cc4d195e2dd92286efbc7b59455a`. Keep lock namespaces, private state markers, physical
identity requirements, bounded retries, ownership refusal, and shared protocol boundaries intact.
Exact CLI/core registry versions and integrity live in package.json/package-lock.json. No upstream
source checkout participates. Registry inputs must pass signed provenance and installed-byte
verification before package imports, typechecking or bundling. CI input and native proof records
retain their cross-job digest boundaries; the README-native job proves its own build artifact.

Run `npm test` during adapter work; run the no-argument registry build,
`npm run typecheck`, and `npm run verify:package`. Never describe local unit tests as native Windows
proof. The native workflow is the authority for its exact source and artifact hashes. Review
precedes QA. Parent coordinates integration, independent and cross-harness review, pushes, CI,
and shared bundle synchronization. No AI attribution in commits.
