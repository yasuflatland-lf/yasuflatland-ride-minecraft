# Camping gear block proof

This throwaway proof supports [ADR 0247](../../docs/adr/0247-precise-camping-gear-rotations-textures-and-cube-budget.md). It tests block rotations, a shared 512 x 512 terrain texture, cutouts, glass, visible cube cost, and hidden variants. It does not modify the shipped packs or implement the item pipeline. All client and BDS results are **pending**: Docker is not running and no Bedrock client is available for this change.

`gen_proof.py` uses Python's standard library and the repository's isolated tool loader, cube math and PNG writer. It needs no Python packages, scripts, experiments, or package-script registration. Its 18 blocks use geometry format 1.12.0, block format 1.21.80, and minimum engine 1.21.80. Pack UUIDs and versions are fixed; remove old imported copies before regenerating and importing a changed proof, to avoid device caches. Keep proof worlds separate from normal play worlds.

## Generate

From the repository root:

```sh
python3 -I spike/camping-gear-proof/gen_proof.py
ls spike/camping-gear-proof/out
```

The ignored `out/` contains `yasu_gear_proof_bp/`, `yasu_gear_proof_rp/`, and `yasu_gear_proof.mcaddon`. An optional output directory is the sole argument. The ZIP has fixed timestamps and sorted entries. The script checks rotated bounds (30 px extent, within 30 px of the origin, at least 1 px overlapping each base-block axis), y = 0, exact budget counts and 8192 cubes in `pair_hidden` before writing each block. These checks assume the 0167 matrix; only the client can confirm that assumption.

The proof atlas uses the proposed 4 x 4 layout, cell-0 swatches at their original texels and 4-texel cell gutters. Cells 1–6 carry alternating saturated red/green backgrounds and three 3 x 5 bitmap numerals, each stroke 8 texels wide; a 7.5 px face sampling 120 texels has 16 texels per model pixel. Cell 7 carries a binary circular outline with a hole and nearest-opaque RGB in transparent pixels. Cell 8 has a translucent region (alpha 110) and an opaque twin, separated by 8 texels; each sampled region has at least 2 texels of matching RGB padding. Probe tile contents are diagnostics, not the production `GEAR_TILES` assignments.

## Checks and fallbacks

All checks run on PC and phone unless the row identifies BDS. Log errors and screenshots belong with the result. A pass on only one device is insufficient for acceptance.

| Question | Proof blocks | What to look at | Pass | Fallback if it fails |
| --- | --- | --- | --- | --- |
| Do single-axis block cubes work? | `rot_one` | Eight yawed vertical panels and one x-tilted inner panel, above and below | Stable ring and correctly tilted panel, no missing faces or content errors | Use axis-aligned stepped geometry; revise 0247 and the kit before item ports |
| Does yaw plus local pitch compose as assumed? | `rot_two`, `pair_rot_two` | Frustum at one item and both pair ends; compare with `rot_two_steps` | Panels lean inward 20 degrees; no holes or twisted panels; both ends match | Set `COMPOUND_TILTS = False` in 4/17's kit |
| Does the stepped fallback work? | `rot_two_steps` | Twelve yaw-only rings, each 0.5 px high | Complete stepped silhouette, no rejected geometry | Use axis-aligned steps and drop detail within the same budget; revise 0247 |
| What happens with three axes? | `rot_three` | Four square tube segments in a rigidly tilted square loop | Closed joints, no twisted segments under the 0167 order | Record order discrepancy; retain the gear prohibition on three axes regardless of result |
| Does the terrain atlas retain 512 resolution? | `atlas_tiles`, adjacent vanilla stone and oak planks | Inspect all six faces close up; numerals and vanilla texture sharpness | All numerals readable; no source downscaling or vanilla texture regression | Reduce atlas to 256 (64 px cells, 56 usable with 4 px gutters), halve density to 4/8; simplify paint and revise 0247 before #1594 |
| Do gutters prevent near-mip bleeding? | `atlas_tiles` | Red beside green, at 8, 16, 32, 48 blocks | No neighbor color at levels corresponding to 1/2; record onset at farther distances | Increase gutter to 8, reduce usable area to 112 and repack regions; revise 0247; farther-mip bleeding remains accepted |
| Do cutouts and padding work? | `cutout_alpha_test` | Round outline and hole against sky, grass, black and white wool, front/back/edges | Hole stays open with no dark/light fringe | Replace cutouts with yaw-only panel rings or stepped outlines within budget |
| Can single-sided alpha test replace the double-sided method? | `cutout_single_sided` | Compare every side to `cutout_alpha_test`, with content logs | Loads and keeps all desired outward faces without unwanted interiors | Keep `alpha_test`; accept its disabled backface culling |
| Does standalone glass sort correctly? | `glass_blend` | Opaque orange core behind/through shell from all directions | Alpha-110 shell translucent, core correctly occluded, no disappearing faces | Keep geometry but use opaque glass in standalone decor too; revise glass rule |
| Can a pair show a cutout and opaque glass? | `pair_alpha_test` | Two visible bones: outline at one end, pale-blue opaque shell at the other | Open hole; twin shell is solid, not threshold-cut or translucent | Keep pairs opaque, replace standing cutouts with geometry; correct twin UVs if that alone fails |
| Can methods mix? | `mix_opaque_alpha_test`, `mix_opaque_blend` | BDS load and placement logs; named `probe` on one item's faces | Record alpha-test acceptance or rejection; reproduce known opaque/blend rejection | Continue one uniform method per pair; never depend on mixed methods |
| What visible cube count passes? | `budget_128`, `budget_256`, `budget_512`, `budget_1024`, `budget_512_alpha_test` | 64 blocks, paired empty/full fixed-view frame rates | Full FPS is at least 90% of empty FPS on both devices | Lower item/pair constants to highest measured passing counts; drop detail, including stepping overhead; if alpha-test cost fails, use opaque pairs and geometry cutouts |
| Do hidden variants add cost? | `pair_hidden` versus `budget_512` | 32 bones x 256 cubes, only first two visible; same visible geometry as control; cold load, FPS, memory if measurable, logs | No errors; FPS at least 90% of control; record load/memory deltas for owner review | Reduce stored variants per geometry via split pair definitions; revise 0247 before dependent item PRs; no universal load/memory threshold is claimed |

The ring panels are rectangular cubes, so adjacent frustum panels intentionally overlap near the narrow end; there must be no open gaps. `rot_two` writes `[pitch, yaw, 0]`, the matrix `Ry(yaw) * Rx(-pitch)`. This is local pitch followed by yaw, not a world-x tilt applied to an already yawed ring. `rot_three` instead uses `tilt_assembly` on an already yawed closed loop to exercise all three axes. Its result is diagnostic and never authorizes three-axis gear cubes.

## Client world: PC and phone

Open `out/yasu_gear_proof.mcaddon` on each device to import it (transfer that file to the phone and open it there). Create a new Creative flat world, enable cheats, and activate both proof packs. Enable Settings > Creator > Enable Content Log GUI; save any errors verbatim. A missing block can itself be the result of an intentionally invalid definition; record it rather than treating placement failure as a visual pass.

Use these chat commands in order. The first clears room above the flat world's floor. Keep the starting position until all relative placement commands finish. Each sign is a row label: edit its text manually to the corresponding block id listed on the same command line below; chat commands are shown separately so they can be pasted directly. Construction inventory names also show `Proof: <name>`.

```text
/gamemode creative
/tp @s 0 -60 0 0 0
/fill -2 -60 -4 40 -55 6 air
/fill 2 -60 -2 24 -60 -2 stone
/setblock ~2 ~ ~ yasu_gear_proof:rot_one
/setblock ~2 ~ ~-3 wall_sign ["facing_direction"=2]
/setblock ~4 ~ ~ yasu_gear_proof:rot_two
/setblock ~4 ~ ~-3 wall_sign ["facing_direction"=2]
/setblock ~6 ~ ~ yasu_gear_proof:rot_two_steps
/setblock ~6 ~ ~-3 wall_sign ["facing_direction"=2]
/setblock ~8 ~ ~ yasu_gear_proof:rot_three
/setblock ~8 ~ ~-3 wall_sign ["facing_direction"=2]
/setblock ~10 ~ ~ yasu_gear_proof:pair_rot_two
/setblock ~10 ~ ~-3 wall_sign ["facing_direction"=2]
/setblock ~12 ~ ~ yasu_gear_proof:atlas_tiles
/setblock ~12 ~ ~-3 wall_sign ["facing_direction"=2]
/setblock ~14 ~ ~ yasu_gear_proof:cutout_alpha_test
/setblock ~14 ~ ~-3 wall_sign ["facing_direction"=2]
/setblock ~16 ~ ~ yasu_gear_proof:cutout_single_sided
/setblock ~16 ~ ~-3 wall_sign ["facing_direction"=2]
/setblock ~18 ~ ~ yasu_gear_proof:glass_blend
/setblock ~18 ~ ~-3 wall_sign ["facing_direction"=2]
/setblock ~20 ~ ~ yasu_gear_proof:pair_alpha_test
/setblock ~20 ~ ~-3 wall_sign ["facing_direction"=2]
/setblock ~22 ~ ~ yasu_gear_proof:mix_opaque_alpha_test
/setblock ~22 ~ ~-3 wall_sign ["facing_direction"=2]
/setblock ~24 ~ ~ yasu_gear_proof:mix_opaque_blend
/setblock ~24 ~ ~-3 wall_sign ["facing_direction"=2]
/setblock 12 -60 2 stone
/setblock 13 -60 2 oak_planks
```

The signs attach to the separate stone support row at z = -2. Label them in order with the proof ids above; the row labels are not part of a measured result.

Inspect the row from both sides and above/below in Creative flight. Use black wool, white wool and grass as backgrounds in turn, for example `/fill 13 -60 2 17 -57 2 black_wool`, then repeat with `white_wool` and `grass_block` (clear with `air` to inspect sky). Inspect `glass_blend` similarly, including from below the shell. To hold equal distance from the atlas block's center, use the following positions and then look toward its faces; record exact video settings, field of view, texture filtering mode if exposed, render distance and screenshots. The distance is measured horizontally from block center to eye x/z.

```text
/tp @s 12.5 -60 -7.5 0 0
/tp @s 12.5 -60 -15.5 0 0
/tp @s 12.5 -60 -31.5 0 0
/tp @s 12.5 -60 -47.5 0 0
```

### Frame-rate procedure

Use the same video settings, resolution, device power mode and fixed camera for empty/full trials. Disable VSync or FPS limiting if possible and record any cap that remains; a capped result can hide cost. Close unrelated applications, let the device settle thermally, warm the world for 30 seconds, then record FPS for 10 seconds at the fixed position without moving. On Windows, open Win+G, pin the Xbox Game Bar Performance widget and enable its FPS view (allow its access/restart if requested). Record the 10-second mean, range, and three repetitions. Pair each full measurement with an empty baseline immediately before it; use the ratio of means and retain the individual runs.

On a phone, first check video and creator settings for a frame-rate display. If absent, record visible stutter while turning the view at a steady rate for 10 seconds, with an empty/full screen recording. Mark numeric FPS and the 10% criterion **unmeasured**; a visual pass alone cannot accept a numeric budget. Obtain a supported device profiler or keep numerical acceptance pending.

Use one 8 x 8 area per block type, at matching relative camera coordinates. Enable Creative flight so the player stays at the requested y. For each trial, teleport, clear the area, measure empty FPS, fill, wait for chunk rebuilding to settle, measure full FPS, then clear again before the next trial. Do not leave previous arrays loaded during another measurement. All arrays are 64 blocks. The 512 control has two 256-cube item bones; `pair_hidden` has identical first two bones and 30 additional invisible bones.

```text
/tp @s 67.5 -59 8.5 0 15
/fill 64 -60 16 71 -60 23 air
/fill 64 -60 16 71 -60 23 yasu_gear_proof:budget_128
/fill 64 -60 16 71 -60 23 air
/tp @s 131.5 -59 8.5 0 15
/fill 128 -60 16 135 -60 23 air
/fill 128 -60 16 135 -60 23 yasu_gear_proof:budget_256
/fill 128 -60 16 135 -60 23 air
/tp @s 195.5 -59 8.5 0 15
/fill 192 -60 16 199 -60 23 air
/fill 192 -60 16 199 -60 23 yasu_gear_proof:budget_512
/fill 192 -60 16 199 -60 23 air
/tp @s 259.5 -59 8.5 0 15
/fill 256 -60 16 263 -60 23 air
/fill 256 -60 16 263 -60 23 yasu_gear_proof:budget_1024
/fill 256 -60 16 263 -60 23 air
/tp @s 323.5 -59 8.5 0 15
/fill 320 -60 16 327 -60 23 air
/fill 320 -60 16 327 -60 23 yasu_gear_proof:budget_512_alpha_test
/fill 320 -60 16 327 -60 23 air
/tp @s 387.5 -59 8.5 0 15
/fill 384 -60 16 391 -60 23 air
/fill 384 -60 16 391 -60 23 yasu_gear_proof:pair_hidden
/fill 384 -60 16 391 -60 23 air
```

The highest tested count whose full mean is at least 0.9 times empty mean on both devices is the measured passing count, not an engine maximum. Test 256 for the per-item contract and 512 for the pair contract, and compare the alpha-test 512 result too. A change from these provisional constants must be recorded in 0247.

For load cost, save separate copies of the same fresh world with only a `budget_512` array or only a `pair_hidden` array present, player at the corresponding camera. Close the client fully between trials. Time from opening each world to the first responsive frame, three trials per world, alternating their order. Record process resident memory after the same 30-second settle if the platform exposes it, otherwise mark memory unmeasured. On BDS, similarly time restart to the server-ready log and separately the client's join to responsive frame. The pack contains both geometries in both cases, so this comparison isolates placed hidden variants, not the cost of merely loading their definitions. To measure definition cost separately, repeat with a generated copy excluding `pair_hidden`'s block and geometry and record that changed artifact explicitly. Inspect content logs in every case.

## Dev BDS

Use this section only with Docker running, for server acceptance of the mix blocks and `pair_hidden`, then repeat the visual checks from both clients. From the repository root:

```sh
pnpm server:up
cp -R spike/camping-gear-proof/out/yasu_gear_proof_bp server/data/behavior_packs/
cp -R spike/camping-gear-proof/out/yasu_gear_proof_rp server/data/resource_packs/
python3 - <<'PY'
import json
from pathlib import Path
world = Path('server/data/worlds/yasuflatland-ride-dev')
for kind, uuid in [('behavior', '65f708d5-ddd6-4dd9-bcca-c555e1b00001'),
                   ('resource', '65f708d5-ddd6-4dd9-bcca-c555e1b00002')]:
    path = world / f'world_{kind}_packs.json'
    entries = json.loads(path.read_text())
    if not any(entry['pack_id'] == uuid for entry in entries):
        entries.append({'pack_id': uuid, 'version': [1, 0, 0]})
    path.write_text(json.dumps(entries, indent=2) + '\n')
PY
docker restart yasuflatland-ride-bds
docker logs yasuflatland-ride-bds 2>&1 | grep -i -E 'yasu_gear_proof|MaterialInstances|geometry'
```

The header UUIDs above match `BP_UUID` and `RP_UUID` in `gen_proof.py`; module UUIDs end in `00003` and `00004` and are not registered in world lists. Both packs use version `[1, 0, 0]`. `docker restart` is appropriate only for this isolated initial proof registration: the main Resource Pack is unchanged, so its dev cache version need not change. Never use this as the normal workflow for changes to the main Resource Pack. Remove previously imported proof copies on clients before joining with a changed proof artifact.

Join from PC and phone and repeat the row and budget commands. The opaque/blend mix should be rejected with the recorded `MaterialInstances` message. The opaque/alpha-test mix result is unknown. If an invalid mix definition prevents the rest of the pack loading, first preserve its logs, then remove only the two generated `blocks/mix_opaque_*.json` definitions from the copied Behavior Pack and restart BDS; identify this reduced artifact in the results. For an equivalent client import, remove those two definitions in `out/yasu_gear_proof_bp`, rezip both pack directories with `python3 -m zipfile -c spike/camping-gear-proof/out/yasu_gear_proof.mcaddon spike/camping-gear-proof/out/yasu_gear_proof_bp spike/camping-gear-proof/out/yasu_gear_proof_rp`, remove old device imports, and import into a new world. Running the generator restores the full diagnostic artifact. A failed mix block is never evidence against an unrelated probe.

Cleanup the copied proof packs and reset world registration:

```sh
rm -rf server/data/behavior_packs/yasu_gear_proof_bp server/data/resource_packs/yasu_gear_proof_rp
pnpm server:restart
```

`scripts/setup-dev-world.mjs` rewrites the world's pack lists during the restart, removing the proof registration. The proof has its own namespace; leave no proof blocks in a normal play world. No world data is committed.

## Results to fill in

No entries below are measured yet. Copy completed results and evidence into ADR 0247's Verification still required section in 17/17 (#1606). If a check fails sooner, record `Probe failure` there and update the provisional budget, atlas size, render methods or rotation rule before dependent work proceeds; use the fallback matrix above.

| Environment | Date | Device / OS / GPU | Client version | BDS version | Video settings / FPS cap / profiler | Artifact / logs / screenshots |
| --- | --- | --- | --- | --- | --- | --- |
| PC | Pending | Pending | Pending | Pending | Pending | Pending |
| Phone | Pending | Pending | Pending | Pending | Pending | Pending |

| Check | PC result / evidence | Phone result / evidence | BDS result / errors | Rule change needed |
| --- | --- | --- | --- | --- |
| `rot_one` | Pending | Pending | Pending | Pending |
| `rot_two` / `pair_rot_two` | Pending | Pending | Pending | Pending |
| `rot_two_steps` | Pending | Pending | Pending | Pending |
| `rot_three` diagnostic | Pending | Pending | Pending | Still forbidden |
| Atlas close resolution / vanilla comparison | Pending | Pending | N/A | Pending |
| Gutters at 8 / 16 / 32 / 48 blocks | Pending | Pending | N/A | Pending |
| `cutout_alpha_test` hole / fringe / back | Pending | Pending | Pending | Pending |
| `cutout_single_sided` loading / culling | Pending | Pending | Pending | Pending |
| `glass_blend` sorting | Pending | Pending | Pending | Pending |
| `pair_alpha_test` cutout / twin | Pending | Pending | Pending | Pending |
| `mix_opaque_alpha_test` | Pending | Pending | Pending | Keep uniform pairs |
| `mix_opaque_blend` rejection | Pending | Pending | Pending | Keep uniform pairs |
| `pair_hidden` visibility / logs | Pending | Pending | Pending | Pending |

Record three empty/full 10-second means and their ranges in each FPS cell. Duplicate rows if more trials are needed. Ratio is full mean / empty mean; for the hidden control comparison also record hidden full FPS / 512 full FPS.

| Block | PC empty / full FPS, ranges, ratio | Phone empty / full FPS, ranges, ratio or visual stutter only | Both numeric passes (>= 0.90) |
| --- | --- | --- | --- |
| `budget_128` | Pending | Pending | Pending |
| `budget_256` | Pending | Pending | Pending |
| `budget_512` | Pending | Pending | Pending |
| `budget_1024` | Pending | Pending | Pending |
| `budget_512_alpha_test` | Pending | Pending | Pending |
| `pair_hidden` | Pending | Pending | Pending |
| Highest passing count / selected item and pair budgets | Pending | Pending | Pending |

| Cold-load comparison (three trials) | PC seconds / settled memory | Phone seconds / settled memory | BDS ready seconds / settled memory | Hidden minus control / owner assessment |
| --- | --- | --- | --- | --- |
| `budget_512` placed | Pending | Pending | Pending | Pending |
| `pair_hidden` placed | Pending | Pending | Pending | Pending |
| Optional definition-excluded control | Pending | Pending | Pending | Pending |

## Spike cube counts

The caller's `count-spike-cubes.mjs` is preserved unchanged. It builds every reference module under Node with a stubbed canvas, counts `BoxGeometry` meshes, and decomposes each cube's world transform as Euler ZYX. Nonzero angles count as axes except angles within tolerance of 180 degrees; the code uses 1e-4 radians. This is a reference measurement, not a claim about the Bedrock client's transform order. Canvas paint is not measured.

Download exactly Three.js 0.160.0 into the ignored output folder, without installing it into the project:

```sh
mkdir -p spike/camping-gear-proof/out/three
npm pack three@0.160.0 --pack-destination spike/camping-gear-proof/out/three
tar -xzf spike/camping-gear-proof/out/three/three-0.160.0.tgz -C spike/camping-gear-proof/out/three
node spike/camping-gear-proof/count-spike-cubes.mjs "$PWD/spike/camping-gear" "$PWD/spike/camping-gear-proof/out/three/package/build/three.module.js"
```

The supplied measurement is:

| Item | Cubes | 0 axes | 1 axis | 2 axes | 3 axes |
| --- | --- | --- | --- | --- | --- |
| percolator | 185 | 7 | 18 | 97 | 63 |
| enamel_kettle | 244 | 10 | 38 | 156 | 40 |
| saucepan | 226 | 7 | 5 | 214 | 0 |
| mug_pair | 220 | 4 | 16 | 200 | 0 |
| sugar_pot | 350 | 3 | 65 | 282 | 0 |
| toaster | 211 | 49 | 146 | 16 | 0 |
| transistor_radio | 140 | 8 | 18 | 8 | 106 |
| potted_plant | 202 | 3 | 0 | 192 | 7 |
| cactus_pot | 184 | 4 | 12 | 132 | 36 |
| macrame_planter | 242 | 12 | 16 | 110 | 104 |

The brief aimed under 250 cubes and never over 400. Nine models fit the provisional 256 limit; `sugar_pot` needs reduction in #1600. Porting and fallback decomposition may change all counts.
