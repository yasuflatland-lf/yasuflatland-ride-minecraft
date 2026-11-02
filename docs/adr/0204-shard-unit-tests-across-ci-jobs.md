# 0204. Shard unit tests across CI jobs

- Status: Accepted
- Date: 2026-11-02
- Extends: [0054](0054-shard-in-game-tests-in-ci.md)

## Context

The unit job takes about 90 s. Its 340 test files contain about 3950 tests and consume about 110 s of CPU time. The test suite is CPU bound on the 4-vCPU runner, so running more workers within that job does not provide enough capacity to shorten the wait.

Sharding was first measured with N = 3. The unit side had a median of 77 s (runs of 77, 82, and 76 s), against 83 s for the single unit job on main. Three shards saved only about 6 s because each job pays about 25 s of setup. The shard count is therefore N = 2, which had a median of 89 s. Moving the Python-backed tests into a separate `tools` job without coverage is the next step to shorten the unit side.

ADR 0054 separates the model check from the unit job and shards the in-game tests. This decision extends it by sharding the unit side.

## Decision

- Split the unit job into `quick`, a two-shard `test` matrix, `tools`, and `coverage`. Keep `model` unchanged.
- Run the Python-backed tests in their own `tools` job, without coverage and without a blob report, in parallel with the covered shards. They add nothing to Codecov because coverage includes only `src/**`, and they are the most CPU-heavy tests. The set is every test file that spawns `python3` or uses `startPythonWorker`: `tests/tools/**`, `tests/support/pythonWorker.test.ts`, and `tests/packs/{litTextures,model,sportsboat,camper,suvPbr,headlights}.test.ts`.
- Pass the same set to the covered shards as additional `--exclude` globs (Vitest keeps its default excludes), so every test runs exactly once.
- Run formatting, language, unused-code, type, and dependency checks, build, and packaging in `quick`, retaining the source-presence conditions.
- Run Vitest with coverage and the blob reporter in each `test` shard, with `fail-fast: false`. Write reports to `.vitest-reports/blob-<shard>.json` and upload `.vitest-reports` as one artifact per shard, including hidden files, with a one-day retention period.
- Use `.vitest-reports` explicitly because Vitest's default blob directory is `.vitest/blob`. Ignore `.vitest-reports/` in Git.
- After all test shards succeed, download and merge their artifacts in `coverage`, merge the Vitest reports, and produce text and LCOV coverage reports. Upload `coverage/lcov.info` to Codecov once with the `unit` flag. No `after_n_builds` setting is needed in `codecov.yml` because there is only one upload.
- Keep the required job id `check`. It needs `quick`, `test`, `tools`, `coverage`, and `model`, echoes all five results, and fails unless every result is `success`.

## Consequences

In a local comparison, the single run and merged reports had identical covered-line sets per file. LCOV `DA` hit counts differed because fast-check is random; in one earlier run, `menuChoices.ts:121` also flipped between covered and uncovered. The merged totals were 4313/6026 branches and 6241/9914 lines, equal to the single run. This fast-check nondeterminism is a known cause of tiny Codecov line deltas unrelated to sharding.

The local shards took 8.7 s, 8.4 s, and 4.8 s of wall time under load. These measurements do not establish the CI speedup. Final layout: the `tools` job runs without coverage, plus 2 covered shards. Three runs of the same workflow run measured the unit side (start to end of coverage) as 62 s, 71 s, and 76 s, median 71 s, against 83 s for the single `unit` job on main after 1/7 to 6/7. That is about 14 % faster; the 45 s target was not reached. For comparison, N = 3 had a median of 77 s, and N = 2 without the `tools` job had a median of 89 s. Failure propagation was checked with a throwaway failing test: placed under `tests/`, it failed a covered shard, skipped `coverage`, and turned `check` red; placed under `tests/tools/`, it failed the `tools` job and turned `check` red. After removal, `check` was green again. Codecov project and patch coverage on the pull request passed. Revisit the shard count if setup and artifact-transfer overhead outweigh the time saved or the shards become substantially unbalanced.

The workflow uses more runners and repeats checkout, tool setup, and dependency installation. Coverage is available only after both shards succeed and their artifacts have been merged. Keeping one Codecov upload avoids partial uploads changing the reported unit coverage.
