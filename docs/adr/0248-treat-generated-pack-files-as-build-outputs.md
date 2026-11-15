# 0248. Treat generated pack files as build outputs

- Status: Proposed
- Acceptance condition: issue #1701 implementation and clean-clone checks pass
- Date: 2026-11-15
- Extends: [0193](0193-shared-texture-tooling.md): generated asset ownership and command integration
- Related: [0015](0015-dev-server-docker-nethernet.md): Resource Pack version checks

## Context

Generated geometry, textures, animations, and block definitions can be recreated from source in `tools/`. Committing them makes design changes grow repository history and obscures the source changes in review. Compact JSON reduces checkout size but still records every regenerated model. Earlier series work supplies a manifest, source templates, and automatic generation before builds and tests.

Alternatives are to keep committing compact files, commit only geometry, or use Git LFS. Compact files still grow history, geometry-only tracking retains the largest generated documents, and LFS adds storage and checkout requirements for reproducible outputs.

## Decision

- Treat every output listed by `tools/run_generators.py --list-outputs --untracked` as an ignored build output. Remove these files from Git's index, retaining local copies. The generated section of `.gitignore` equals this list in order, enforced by `tests/tools/generatedOutputs.test.ts`.
- Keep renderer outputs marked `tracked: true` committed: `docs/images/` previews, rendered item icons, and the three `pack_icon.png` files. GitHub and pack manifests display these directly. Keep hand-written pack files committed. Remove obsolete generated Linguist attributes and Biome exclusions.
- `pnpm generate` creates build outputs locally, in CI, and for releases. Unit jobs that run Vitest, build, or package restore untracked outputs and `.cache/generated` through `actions/cache`, keyed by `hashFiles('tools/**', 'mise.toml')`, then ensure generation. The cache-path listing uses Python `-B` so it cannot add bytecode under `tools/**` before hashing the key. External input changes invalidate the runner fingerprint even on a cache hit. Integration and release workflows generate explicitly before tests or build.
- Preserve the model job's input filter (0057), excluding generated build paths. `pnpm model:check` ensures freshly generated packs before checking committed previews and icons with the renderer. `pnpm model` forces all generators and refreshes renderings.
- Version checks treat tracked Resource Pack changes or generator-input changes as requiring a version bump (0015), both against the previous release tag and against the pull request base. Build-output removals from older tags do not count as source changes. This migration changes no served content and requires no manifest bump.

## Consequences

Design changes record generator sources and refreshed committed renderings, without multi-megabyte generated pack diffs. Clean clones must generate before reading build outputs; build and Vitest already ensure this. Packaging requires a successful build. A cache saves generation time but is optional for correctness. Tooling-only generator-input changes conservatively require a Resource Pack version bump. Restore retained images from Git or run `pnpm model` if they are missing.
