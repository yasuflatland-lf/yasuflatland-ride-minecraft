# 0193. Share texture tooling between generators

- Status: Proposed
- Date: 2026-10-30
- Amends in part: [0147](0147-light-the-lamps-with-a-pbr-emissive-layer.md), [0057](0057-skip-model-check-when-inputs-unchanged.md)

## Context

The generators copy the same texture tooling, and the copies have started to drift (#977):

- the MER triples `MER_LIT = (0, 255, 255)` and `MER_OFF = (0, 0, 255)` are copied into the SUV, camper, sports boat and bulldozer generators, while `tools/mer_atlas.py` keeps its MER values as palette pairs;
- the texture set JSON is built in five places;
- `lit_textures(kind, width, height, pixel)` exists four times, and the copies differ only in how they test whether a texel is lit;
- the camper, sports boat and bulldozer each carry an `emit`/`png` writer with a `--check` mode, and `mer_atlas.write_or_check` is a fourth variant that stops at the first stale file and compresses at zlib level 9.

0147 justified the copies because isolated Python execution (`python3 -I`) prevented importing a shared helper. `tool_loader.load_tool` has since removed that obstacle. The SUV is about to gain per-paint MER maps and a lit texture over several regions, which would add another copy.

## Decision

Generators load three shared modules with `tool_loader.load_tool`:

1. `tools/mer.py`: a validated `Mer(metalness, emissive, roughness)` value with `rgba()`, the constants `MER_OFF` and `MER_LIT`, and `mer_painter(lookup, default)`. It does no I/O.
2. `tools/texture_io.py`: `Outputs(check)` writes JSON and PNG files, or under `--check` compares JSON parsed and PNGs by decoded pixel rows, collects every stale path, and reports them in `finish`. `png` takes a `compress_level` so each generator keeps its PNG bytes (`mer_atlas` uses 9, the others the zlib default). `texture_set_doc` and `write_texture_set` build the 1.16.100 texture set.
3. `tools/lit_textures.py`: `build_lit_textures` writes `<kind>_lit.png`, `<kind>_lit_mer.png` and `<kind>_lit.texture_set.json` from a colour callback and an `is_lit` test.

The copies are no longer justified, which amends the rationale in 0147. Every generated file stays byte-identical when a generator adopts the modules. The camper and the MER atlas users (fire pit, Dutch oven, Gas Lantern) adopt them first. The SUV adopts them in 6/17; the sports boat, bulldozer, and gear generators follow in 8/17.

Widen the model CI job path filter to include every `tools/*.py` file. The filter matches `tools/[^/]+\.py` instead of a list of generator names. This amends the consequence in 0057 that `tools/gen_model.py` and `tools/gen_sportsboat.py` are left out of the pattern.

## Consequences

- A fix to writing, checking or lit textures lands once for every adopter. Until 8/17 lands, the sports boat, bulldozer and gear generators still carry their own copies.
- A shared-module change can affect several generators at once. `pnpm model:check` runs `--check` for the camper, MER atlas and gear generators; `tools/gen_model.py` has no `--check`, so SUV drift is caught only where `render_preview --check` notices it in the preview. 6/17 must add `gen_model.py --check` to `model:check` when the SUV adopts the shared modules.
- The model job also runs for Python tools that do not feed the renderer, such as `tools/gen_sounds.py`. That costs CI time on those pull requests, which are rare.
