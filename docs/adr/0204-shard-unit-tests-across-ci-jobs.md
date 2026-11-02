# 0204. Shard unit tests across CI jobs

- Status: Proposed
- Date: 2026-11-02
- Extends: [0054](0054-shard-in-game-tests-in-ci.md)

## Context

The unit job takes about 90 s. Its 339 test files contain about 3950 tests and consume about 110 s of CPU time. The test suite is CPU bound on the 4-vCPU runner, so running more workers within that job does not provide enough capacity to shorten the wait.

ADR 0054 separates the model check from the unit job and shards the in-game tests. This decision extends it by sharding the unit side.

## Decision

- Split the unit job into `quick`, a three-shard `test` matrix, and `coverage`. Keep `model` unchanged.
- Run formatting, language, unused-code, type, and dependency checks, build, and packaging in `quick`, retaining the source-presence conditions.
- Run Vitest with coverage and the blob reporter in each `test` shard, with `fail-fast: false`. Write reports to `.vitest-reports/blob-<shard>.json` and upload `.vitest-reports` as one artifact per shard, including hidden files, with a one-day retention period.
- Use `.vitest-reports` explicitly because Vitest's default blob directory is `.vitest/blob`. Ignore `.vitest-reports/` in Git.
- After all test shards succeed, download and merge their artifacts in `coverage`, merge the Vitest reports, and produce text and LCOV coverage reports. Upload `coverage/lcov.info` to Codecov once with the `unit` flag. No `after_n_builds` setting is needed in `codecov.yml` because there is only one upload.
- Keep the required job id `check`. It needs `quick`, `test`, `coverage`, and `model`, echoes all four results, and fails unless every result is `success`.

## Consequences

In a local comparison, the single run and merged reports had identical covered-line sets per file. LCOV `DA` hit counts differed because fast-check is random; in one earlier run, `menuChoices.ts:121` also flipped between covered and uncovered. The merged totals were 4313/6026 branches and 6241/9914 lines, equal to the single run.

The local shards took 8.7 s, 8.4 s, and 4.8 s of wall time under load. These measurements do not establish the CI speedup. Fill in median CI timings after the pull request runs, and revisit the shard count if setup and artifact-transfer overhead outweigh the time saved or the shards become substantially unbalanced.

The workflow uses more runners and repeats checkout, tool setup, and dependency installation. Coverage is available only after all three shards succeed and their artifacts have been merged. Keeping one Codecov upload avoids partial uploads changing the reported unit coverage.
