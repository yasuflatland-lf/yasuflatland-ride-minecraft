# 0193. Share texture tooling between generators

- Status: Proposed
- Acceptance condition: owner decision pending (see #1193)
- Date: 2026-10-30
- Supersedes in part: [0057](0057-skip-model-check-when-inputs-unchanged.md): the model CI path filter that left out tools/gen_model.py and tools/gen_sportsboat.py
- Supersedes in part: [0147](0147-light-the-lamps-with-a-pbr-emissive-layer.md): the rationale for copying texture tooling into each generator

## Context

The generators copy the same texture tooling, and the copies have started to drift (#977):

- the MER triples `MER_LIT = (0, 255, 255)` and `MER_OFF = (0, 0, 255)` are copied into the SUV, camper, sports boat and bulldozer generators, while `tools/mer_atlas.py` keeps its MER values as palette pairs;
- the texture set JSON is built in five places;
- `lit_textures(kind, width, height, pixel)` exists four times, and the copies differ only in how they test whether a texel is lit;
- the camper, sports boat and bulldozer each carry an `emit`/`png` writer with a `--check` mode, and `mer_atlas.write_or_check` is a fourth variant that stops at the first stale file and compresses at zlib level 9.

0147 justified the copies because isolated Python execution (`python3 -I`) prevented importing a shared helper. `tool_loader.load_tool` has since removed that obstacle. The SUV is about to gain per-paint MER maps and a lit texture over several regions, which would add another copy.

## Decision

Generators load shared modules with `tool_loader.load_tool`:

1. `tools/mer.py`: a validated `Mer(metalness, emissive, roughness)` value with `rgba()`, the constants `MER_OFF` and `MER_LIT`, `mer_painter(lookup, default)`, and `layout_mask(layout, region_name, local_mask)` for bounded local-to-atlas masks. It does no I/O.
2. `tools/texture_io.py`: `Outputs(check)` writes JSON and PNG files, or under `--check` compares JSON parsed and PNGs by decoded pixel rows, collects every stale path, and reports them in `finish`, appending the exception reason in parentheses when reading or decoding fails. `png` accepts RGB or RGBA texels and pads RGB texels with alpha 255 once before writing or comparing. `png` takes a `compress_level` so each generator keeps its PNG bytes (`mer_atlas` uses 9, the others the zlib default). `texture_set_doc` and `write_texture_set` build the 1.16.100 texture set.
3. `tools/lit_textures.py`: `build_lit_textures` writes `<kind>_lit.png`, `<kind>_lit_mer.png` and `<kind>_lit.texture_set.json` from a colour callback and an `is_lit` test. `build_layout_lit_textures` takes a `Layout` and a named region-local mask, deriving companion dimensions and relocating the mask before delegating to that writer.

The camper also loads `tools/camper_regions.py` through `tool_loader`: `Material`, frozen `Region`, `RegionRegistry`, `RegionRef`, `Layout`, `pack`, `render_atlas`, and `audit` own region metadata, atlas placement, local-to-atlas UV resolution, and lossless validation. Material classifications are `SWATCHES_MIXED`, `METAL`, `LACQUER`, `GLASS_COAT`, `VINYL`, `WOOD`, `FABRIC`, `CARPET`, `TILE`, `STONE`, and `DARK_LACQUER`. They identify finishes for companion-map tooling; they do not assign a uniform MER value to the mixed base. The camper wrapper retains the shared `swatch_atlas.Atlas` for nested swatches and hardware, leaving other generators unchanged (0190).

`tools/camper_mer.py` builds packed RGBA bytes from `Layout` materials, with alpha 255 and G = 0 everywhere. `MER_BY_MATERIAL` assigns `(metalness, 0, roughness)`: METAL `(255,0,60)`, LACQUER `(0,0,80)`, GLASS_COAT `(0,0,65)`, VINYL `(0,0,180)`, WOOD `(0,0,150)`, FABRIC `(0,0,245)`, CARPET `(0,0,250)`, TILE `(0,0,80)`, STONE and DARK_LACQUER `(0,0,85)`. `SWATCHES_MIXED` uses nested semantic tables instead of a uniform value. Steel/chrome/slat/aluminium use metalness 255 and roughness 75/50/80/80; white/panel/ivory use dielectric roughness 85/90/80; dash/dark_dash/dash_pad use 185/190/175; gauge/needle use 65; wood/wall_in use 155/160; tweed/tweed_line/curtain use 245, piping 235, carpet_beige 250; khaki/stripe/tan use 100. Ribs use dielectric roughness 85, door/vent/bolt hardware metalness 255 and roughness 75, and mirror chrome retains `(255,0,26)`. Unclassified swatches and unused space default to `(0,0,255)`, including lens, marker, dome and glow swatches. Shared swatches apply the same finish wherever sampled, including exterior surfaces. Diffuse colour, alpha and baked highlights do not determine the MER values.

`tools/camper_golden.py compare --golden-dir DIR [--area NAME]` compares current pack geometry cube counts per bone and registry sizes/origins with `final-model.json.gz` and `final-regions.json` in the supplied directory. Golden `packed_origin` takes precedence over its source `origin`; the spike's descriptive base name is normalized to `base`. Area selection uses exact labels in current area ranges and golden cube `_area` tags, restricting regions to those used by that area. Current module labels and spike visual-feature labels can differ; a label missing on either side is reported as a difference, rather than guessed from overlapping feature groups. Current counts inspect actual cubes within the ownership ranges, so a stale range cannot count deleted geometry. A unified diff exits 1 on mismatch; a match exits 0. Golden artifacts stay outside the repository and their path is never embedded in tooling. Small temporary fixtures test the CLI; the unfinished camper is expected to differ from the completed-series golden.

The copies are no longer justified, which amends the rationale in 0147. Every generated file stays byte-identical when a generator adopts the modules. The camper, SUV, sports boat, bulldozer, camping gear, and MER atlas users (fire pit, Dutch oven, Gas Lantern) use the shared modules.

Widen the model CI job path filter to include every `tools/*.py` file. The filter matches `tools/[^/]+\.py` instead of a list of generator names. This amends the consequence in 0057 that `tools/gen_model.py` and `tools/gen_sportsboat.py` are left out of the pattern.

## Consequences

- A fix to writing, checking or lit textures lands once for every adopter.
- A shared-module change can affect several generators at once. `pnpm model:check` runs the generator runner in check mode, including vehicles, gear, models, textures and previews, so drift in any adopter's output fails it.
- The model job also runs for Python tools that do not feed the renderer, such as `tools/gen_sounds.py`. That costs CI time on those pull requests, which are rare.
