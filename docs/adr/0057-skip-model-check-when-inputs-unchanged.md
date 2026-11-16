# 0057. Skip model:check on pull requests that leave the renderer's files alone

- Status: Accepted
- Date: 2026-10-12

## Context

0054 moved `pnpm model:check` into its own `model` job beside the unit tests, where it took about 27 s. The sports boat previews (0056) add four more images, and the check now runs in about 21 s on a Mac, longer on the CI runner. Most pull requests change scripts, tests, or docs, none of which the renderer reads, so they cannot make the previews or the pack icons stale.

## Decision

- On a pull request, the `model` job checks out with depth 2 and lists the files the merge commit changes against its base (`HEAD^1`). It runs `pnpm model:check` only when a changed path matches the inputs or committed outputs declared by `tools/generators.json`, consumed through `tools/run_generators.py --list-inputs` and `--list-outputs` (0193), or `package.json`, `mise.toml`, or `.github/workflows/unit-test.yml`. Input consumers exclude `__pycache__` paths and declared untracked build outputs, including generated files read by the renderer. The job calls `.github/actions/generated-files` (0248) to restore cached outputs and run `pnpm generate` before `pnpm model:check`, whose script ensures generation and runs `python3 -I tools/run_generators.py --check` for every generator, including the renderer, and verifies output ownership against the manifest.
- Otherwise the job skips mise and the render and succeeds, so the required `check` job still passes without a change to the ruleset
- A push to `main` always runs the check

## Consequences

- Pull requests that do not touch the model finish the `model` job in a few seconds
- A new external generator input must be declared in its `reads`; every file under `tools/**` is already an implicit input. Generated outputs are declared per generator and checked for complete coverage (0193).
- Generator changes trigger the check directly through `tools/**`, including `tools/gen_model.py` and `tools/gen_sportsboat.py`.
