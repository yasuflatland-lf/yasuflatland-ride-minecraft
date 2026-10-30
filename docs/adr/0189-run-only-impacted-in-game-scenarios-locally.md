# 0189. Run only impacted in-game scenarios locally

- Status: Proposed
- Date: 2026-10-30
- Extends: 0054

## Context

An unsharded local in-game run takes about 391 seconds at 20 TPS even when a change touches only one feature. Feature folders (0046) provide a path-to-feature mapping, but scenarios exercise the main pack through script events rather than imports. Local selection can use that mapping while CI continues to run every scenario.

## Decision

Use the closed set of feature tags `build`, `camp`, `vehicle`, `vehicle:suv`, `vehicle:camper`, `vehicle:sportsboat`, and `vehicle:bulldozer`. A changed `vehicle` covers every `vehicle:*` scenario. A scenario lists every kind or feature it exercises, including ones it only reaches through identifiers or entity types.

A static, ordered rule table maps each changed path to `all`, `none`, or tags. The first match wins. The following paths select everything:

- The harness, except `catalog.ts` and `scenarios/index.ts`.
- Every source file a harness file imports.
- Shared code, bootstrap, and install files.
- Manifests, scripts, the server, and the toolchain.

`catalog.ts` and `scenarios/index.ts` select nothing because they change together with a scenario file, and that file carries the tags. Docs, tests, and Resource Pack-only changes select nothing. A path no rule names selects everything.

The changed files are `git diff --name-only --no-renames <base>` plus untracked files. `--no-renames` makes a file moved out of `shared/` count at its old path. The base is `GAME_TEST_BASE`, or otherwise `git merge-base HEAD origin/main`. Nothing is fetched. A git failure selects everything, and an empty selection exits 0 without contacting the BDS.

`CI`, `GAME_TEST_SHARD`, and `GAME_TEST_ALL=1` select everything. An explicit `GAME_TEST_FEATURES` wins over the diff. Tags travel as one `features=` token, never as scenario names, because a scriptevent message is limited to 2048 characters.

Reject dependency-cruiser `--affected` and an esbuild metafile for selection. Scenarios do not import the code they exercise: it runs in the main pack and is driven through script events. An import graph from scenario files therefore cannot see what they exercise, and the feature folders already give the mapping. Reject diffing in CI because the checkout has depth 1.

## Consequences

Local runs can skip scenarios for untouched features and avoid contacting the BDS when nothing is selected. Selection depends on the rule table and complete scenario tags, including indirect use through identifiers and entity types. Unknown paths and git failures fall back to the whole suite. CI keeps running every scenario.
