# 0057. Skip model:check on pull requests that leave the renderer's files alone

- Status: Accepted
- Date: 2026-10-12

## Context

0054 moved `pnpm model:check` into its own `model` job beside the unit tests, where it took about 27 s. The sports boat previews (0056) add four more images, and the check now runs in about 21 s on a Mac, longer on the CI runner. Most pull requests change scripts, tests, or docs, none of which the renderer reads, so they cannot make the previews or the pack icons stale.

## Decision

- `model-plan` checks out at depth 2 and, on pull requests, pipes `git diff --name-only -z HEAD^1 HEAD` into `python3 -I -B tools/select_model_scenes.py`. The selector reads `tools/generators.json` and returns a JSON scene array and an `others` boolean as job outputs. It needs only Python's standard library.
- A changed `tools/gen_*.py` matching a manifest entry sets `others` and selects scenes reading its outputs or the outputs of downstream non-render generators, following their declared reads transitively. Any other `tools/**` change (including an unknown generator), `package.json`, `mise.toml`, or the unit workflow selects every scene and `others`. Otherwise, paths match each scene's reads and outputs, and the other entries' reads and tracked outputs, using case-sensitive POSIX `fnmatch`. Every path matching a non-render entry's reads or tracked outputs also sets `others` and follows the same transitive dependency closure to select scenes reading affected outputs. Paths containing a `__pycache__` component are ignored.
- `model-others` runs when `others` is true. On pull requests it checks every non-render manifest id with `run_generators.py --check --only`. `model-scene` uses the selected scene array as a matrix with `fail-fast: false`, checking each `render_preview.py:<scene>` id separately. An empty scene array skips the matrix. Both jobs install tools through mise and call `.github/actions/generated-files` (0248) to restore cached outputs and run `pnpm generate` before checking. Selected checks verify ownership for their selected entries (0193).
- The required job id and name remain `check`. It requires `quick`, `test`, `tools`, `coverage`, and `model-plan` to succeed; only `model-others` and `model-scene` may succeed or be skipped.
- Pushes to `main` select every scene with `--all` and run the full `pnpm run model:check` in `model-others`, preserving complete output-ownership verification. The full command remains available locally.

## Consequences

- Docs-only pull requests skip both checking jobs. A change to one vehicle's model selects only the scene that reads it; a renderer change selects all six scenes in parallel. Render wall-clock time depends on the slowest selected scene and runner setup, rather than the combined render workload.
- Every external input must be declared in its entry's `reads`. Generated outputs must have complete, unique ownership (0193), including pack icons in the SUV scene and item icons in the gear scene. Shared tools changes deliberately select everything rather than risk stale previews.
- The explicit non-render id list in the workflow must stay synchronized with the manifest; `tests/tools/modelCheckWorkflow.test.ts` checks this and the matrix and aggregate gate contracts.
- Main pushes perform both the matrix checks and a full check. This duplicates rendering on main to retain complete ownership verification while pull requests use selective checks.
