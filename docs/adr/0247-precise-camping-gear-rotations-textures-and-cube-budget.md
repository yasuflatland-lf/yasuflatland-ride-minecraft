# 0247. Precise camping gear: rotations, texture tiles, cube budget, and glass

- Status: Proposed
- Acceptance condition: the owner records the client results in the spike/camping-gear-proof README results table and accepts this ADR in [17/17] (#1606)
- Date: 2026-11-11
- Extends: [0093](0093-decorate-the-parked-camper.md): the gear atlas, render methods, and decor block geometry
- Extends: [0169](0169-a-lantern-for-the-oil-lamp-and-a-noga-chair.md): the one-axis rule for gear cubes
- Related: [0108](0108-two-items-on-each-shelf-board-and-the-table.md): pair blocks
- Related: [0167](0167-compound-rotation-assemblies-as-a-vehicle-neutral-rule.md): registered assemblies
- Related: [0246](0246-toilet-and-washstand-shows-and-cutouts.md): cut-out alpha rules

## Context

The [camping gear spike](../../spike/camping-gear/README.md) uses compound panel tilts and painted details: dial numerals, gloss, and wood grain. The shipped gear pipeline has neither painted tiles nor registered gear assemblies. This ADR fixes provisional contracts for #1592 through #1605 before those pull requests start. Docker is not running and no Bedrock client is available. No result here establishes rendering or performance on a device; acceptance waits for #1606.

### Verified repository evidence

Inspection of `packs/yasu_ride_rp/models/blocks/yasu_ride/` on 2026-11-11 found 22 geometry files and zero rotated cubes. Even one-axis cube rotation in gear block geometry has no in-game evidence in this repository. Each of `shelf_decor_pair`, `table_decor_pair`, `cabinet_decor_pair`, and `fridge_decor_pair` has 32 bones (16 standing items at two ends) and 122 cubes; `bone_visibility` selects at most two bones. The catalog `tools/camping_gear.json` contains 17 items: 16 standing and the hanging `macrame_planter`. Only `sugar_pot` has `glass: true`.

`tools/gen_camping_gear.py` writes `textures/blocks/yasu_ride/camping_gear.png`, a 16 x 16 atlas of sixteen 4 x 4 flat swatches, under terrain shortname `yasu_ride_camping_gear`. Its docstring says 4 x 4 swatches stop mipmap bleeding; this is a generator claim, not a new client measurement. Geometry texture dimensions are 16. The glass swatch has alpha 110. Decor uses `blend` for glass and `opaque` otherwise. All pair blocks use `opaque`: the generator records BDS rejecting mixed opaque and blending instances with `MaterialInstances can't mix and match opaque and transparent materials`.

Nineteen shipped custom-geometry blocks use a single `*` instance with `alpha_test` and `deck_floor` geometry, including `camper_floor.block.json`. BDS therefore accepts this render method on custom geometry. Their textures are fully transparent, so partial cutouts on a face remain unverified. `cube_tilt.tilt_assembly` and `assert_axes` exist, but the gear generator calls `cube_tilt.assert_axes(cubes, {})`, permitting no compound cube. The 0167 matrix order `Rz(-rz) * Ry(ry) * Rx(-rx)` remains unconfirmed on a device. ADR 0246 accepted binary cutout alpha and nearest-opaque RGB padding for entities without in-game verification; it provides a proposed block technique, not evidence that blocks behave identically.

The four pair JSON files are 66,158, 66,308, 66,160, and 66,159 bytes for shelf, table, cabinet, and fridge respectively. Dividing each file's byte size by its 122 cubes gives 542.3–543.5 bytes per cube, including bone and description overhead. Linear extrapolation gives about 4.24 MiB per 8,192-cube geometry, or about 17 MiB across four pair files, before compression. Rotations, UV detail, and formatting can change this estimate; it is not GPU memory usage.

### Measured spike evidence

The caller measured these counts with [count-spike-cubes.mjs](../../spike/camping-gear-proof/count-spike-cubes.mjs), Three.js 0.160.0, and a stubbed canvas under Node. It builds each item, decomposes each cube's world rotation as Euler ZYX, and counts nonzero angles except 180-degree equivalents. These counts describe the reference spike, not exported Bedrock geometry or a verified Bedrock rotation order. The [proof instructions](../../spike/camping-gear-proof/README.md#spike-cube-counts) reproduce the measurement. The brief targets under 250 cubes and never over 400.

| Item             | Cubes | 0 axes | 1 axis | 2 axes | 3 axes |
| ---------------- | ----- | ------ | ------ | ------ | ------ |
| percolator       | 185   | 7      | 18     | 97     | 63     |
| enamel_kettle    | 244   | 10     | 38     | 156    | 40     |
| saucepan         | 226   | 7      | 5      | 214    | 0      |
| mug_pair         | 220   | 4      | 16     | 200    | 0      |
| sugar_pot        | 350   | 3      | 65     | 282    | 0      |
| toaster          | 211   | 49     | 146    | 16     | 0      |
| transistor_radio | 140   | 8      | 18     | 8      | 106    |
| potted_plant     | 202   | 3      | 0      | 192    | 7      |
| cactus_pot       | 184   | 4      | 12     | 132    | 36     |
| macrame_planter  | 242   | 12     | 16     | 110    | 104    |

### Official documentation evidence

Microsoft Learn's [Advanced Block Visuals](https://learn.microsoft.com/en-us/minecraft/creator/documents/customblockoversized) limits geometry to 30 x 30 x 30 px, within 30 px of the origin on each axis, with at least 1 px on each axis inside the base 16 x 16 x 16 block. It states no cube rotation-axis or cube-count limit.

The [material instances reference](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/blockreference/examples/blockcomponents/minecraftblock_material_instances) documents `opaque` without transparency or translucency, `alpha_test` with binary alpha and backface culling disabled, `alpha_test_single_sided` with culling enabled, `blend` with transparency and translucency, and `*_to_opaque` variants. It limits instances to 64, without stating whether methods can mix in one block. [Render and lighting options](https://learn.microsoft.com/en-us/minecraft/creator/documents/customblockrenderlighting) says opaque rendering substitutes the nearest opaque color for transparent or translucent texels; alpha test respects transparency but not translucency.

The [geometry component reference](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/blockreference/examples/blockcomponents/minecraftblock_geometry) documents `bone_visibility`, including Molang since 1.20.10, without a bone or cube limit. These pages state no terrain atlas size limit, mipmap level count, or guarantee that a larger source texture shares the terrain atlas with 16 x 16 textures at full resolution. These pages were read on 2026-11-11. Atlas behavior needs the client proof.

## Decision

All following rules are **PROVISIONAL**. They are implementation contracts for the series, not claims of measured client support. This change implements none of them in the shipped pipeline.

### Rotation rule

A gear cube carries at most one nonzero rotation axis (0169), unless it belongs to a registered gear assembly using the 0167 mechanism. The gear generator gains `ASSEMBLIES = {name: {"owner": "camping_gear", "cubes": count}}`, with numeric counts. Names are `<item_id>_<part>`, for example `percolator_body`, `percolator_spout`, and `toaster_handle`; each item's implementation registers its actual parts. Build through `cube_tilt.tilt_assembly(..., assembly=name, assemblies=ASSEMBLIES)` and retain final member cubes for `assert_axes(cubes, members, ASSEMBLIES)`.

An assembly cube carries at most TWO axes: yaw about y and pitch about its own x, composing `Ry(ry) * Rx(-rx)`. This covers a loft panel leaning inward or outward and a tube segment pointing in any direction. Three-axis cubes are forbidden in gear: direction needs yaw plus pitch, and these square tubes and panels do not need roll. Port the spike's three-axis cubes in percolator, enamel kettle, transistor radio, potted plant, cactus pot, and macrame planter as two-axis cubes. Because `tilt_assembly` applies a world-x tilt on the left, the kit must construct local pitch before yaw, or compose the equivalent matrix; globally tilting an already yawed ring can introduce the forbidden third axis. The two-axis check is additional to assembly membership.

If the proof shows ring gaps or twisted panels from a different composition order, 4/17's `tools/gear_kit.py` switches one constant, `COMPOUND_TILTS = False`. Every loft becomes stepped rings of yaw-only vertical panels with height steps at most 0.5 px; every tube becomes axis-aligned or yaw-only segments. Item modules call the kit and do not change. Stepping must fit the budget below; an over-budget item drops detail rather than raising the budget.

Pair blocks retain one bone per item per end (0108). Assemblies belong to items, so a pair block's compound cubes are the union of its selected items' registered assemblies, translated into their final end coordinates for validation.

### Atlas layout

Keep one PNG, `textures/blocks/yasu_ride/camping_gear.png`, and terrain shortname `yasu_ride_camping_gear`, growing the PNG and every gear geometry's `texture_width` and `texture_height` to 512. The 512 x 512 atlas is a 4 x 4 grid of 128 x 128 cells. Cell 0 keeps all sixteen existing flat swatches at x 0–15, y 0–15. Existing swatch UVs remain valid, so untiled items keep their appearance.

5/17 owns this static `GEAR_TILES` table; item pull requests do not edit it. Cell n starts at `(128 * (n % 4), 128 * (n // 4))`.

| Cell  | Item               |
| ----- | ------------------ |
| 0     | Existing swatches  |
| 1     | `percolator`       |
| 2     | `toaster`          |
| 3     | `enamel_kettle`    |
| 4     | `transistor_radio` |
| 5     | `sugar_pot`        |
| 6     | `mug_pair`         |
| 7     | `saucepan`         |
| 8     | `potted_plant`     |
| 9     | `cactus_pot`       |
| 10    | `macrame_planter`  |
| 11–15 | Spare              |

Each item cell's outer 4 texels are an edge-extension gutter, leaving 120 x 120 usable texels at offset (4, 4). Within a tile, every painted region sampled by a face has 2 texels of edge extension around it. Four texels exclude neighbors from mip levels 1 and 2 under a 4 x 4 footprint assumption; this is a layout rationale awaiting the client check, not a claim about the undocumented terrain mip chain. Bleeding at farther mip levels is accepted.

Painted faces use `TEXELS_PER_PX = 8` texels per model pixel. Lettering and numeral faces may use 16. Identically painted faces share regions, including mirrored or repeated panels; flat faces keep their cell-0 swatches.

Apply 0246's alpha rules to blocks: non-glass texels have alpha 0 or 255, and alpha-0 texels retain the RGB of the nearest opaque texel. Alpha 1–254 occurs only in glass regions of a `glass: true` item, with alpha 64–192; today's glass swatch is 110.

Each item pull request paints only its assigned cell. The PNG is a pure function of generators. After a rebase or merge, never hand-merge `camping_gear.png` or any generated gear file: select either side with `git checkout --theirs <file>` or `git checkout --ours <file>`, run `pnpm model`, and commit the regenerated file. `pnpm model:check` proves freshness.

Rejected alternative: one PNG and terrain entry per item. A pair block draws two items with one `*` material instance; separate textures would require a named instance per item on every face and 17 more terrain entries.

### Render methods and glass

A standalone decor block uses `opaque` for a non-glass item whose sampled faces contain no alpha-0 texels, `alpha_test` for a non-glass item sampling cutouts, and `blend` for a glass item. The opaque and blend choices retain today's behavior.

Pair blocks use one method for the entire block: BDS rejects opaque/blend mixing, and opaque/alpha-test mixing is unverified. Keep all pair blocks `opaque` until the first standing item samples alpha-0 texels; that item's pull request switches all pair blocks to `alpha_test`. Choose `alpha_test` because it is shipped and known to load on BDS; switching to `alpha_test_single_sided`, which retains backface culling, remains a proof question.

Glass translucency is allowed only in a standalone glass decor block with `blend`. Pair glass remains opaque. Once pairs use `alpha_test`, translucent texels could be cut or kept according to an unverified engine threshold: each glass region gets an opaque twin in the same item tile (same RGB, alpha 255). Pair geometry samples the twin, while standalone geometry keeps the translucent region and `blend`. Sorting translucent faces against the same item's opaque faces is unverified on a client.

### Cube budget

Set `MAX_CUBES_PER_ITEM = 256`, counted after decomposition for one hanging or standing item, and `MAX_CUBES_PER_PAIR_BLOCK = 512`, counted for the two visible items. These constants live in one place in the generator; 6/17 adds checks that fail with the item id and actual and allowed counts. The item limit rounds the brief's under-250 target to a power of two. Nine of ten spike items fit today; `sugar_pot` (350) must lose detail in #1600 unless the proof explicitly raises the budget in this ADR.

The owner measures both PC and phone using the [proof procedure](../../spike/camping-gear-proof/README.md): fill an 8 x 8 area (64 blocks) with N-cube proof blocks at a fixed view and compare against the empty view. A budget passes when frame rate stays within 10 percent of baseline. ADR 0093 lists 12 decor slots before later furniture, so 64 blocks exceeds the expected real load several times. A phone without a frame-rate display can record visible stutter, but that cannot establish the numerical threshold.

Pair geometry stores every standing item at both ends: at the limit, `2 x 16 x 256 = 8192` cubes per geometry, although only 512 are visible. Hidden-bone load time, memory and frame-time costs remain unverified; compare `pair_hidden` with `budget_512`. Every detailed item increases Resource Pack size, including duplication across pair geometries.

### Series

Each item pull request that changes Resource Pack assets bumps the header, modules, and matching Behavior Pack dependency once relative to main (0015). The mug pair port uses 0.1.300 against main's 0.1.299; merging main does not require a second bump. Part 17/17 verifies the resulting version rather than deferring the item ports' cache invalidation until then.

| Part       | Issue       | Contract                                                                              |
| ---------- | ----------- | ------------------------------------------------------------------------------------- |
| 3/17       | #1592       | Refactor with no output change                                                        |
| 4/17       | #1593       | Rotation rule and `COMPOUND_TILTS` in the geometry kit                                |
| 5/17       | #1594       | Atlas, static tiles, gutter, density and alpha                                        |
| 6/17       | #1595       | Budget constants and checks                                                           |
| 7/17–16/17 | #1596–#1605 | Item ports follow these contracts                                                     |
| 17/17      | #1606       | Record proof results, accept or revise this ADR, and verify the Resource Pack version |

## Consequences

The 512 x 512 RGBA atlas consumes 1 MiB before mipmaps. Pair files duplicate detailed items; the current JSON estimate is about 4.24 MiB per maximum-size geometry. `alpha_test` disables backface culling across a whole pair, increasing rendered faces. Opaque glass twins consume tile space. Restricting roll can change panel or tube details, and the stepped fallback can force detail reductions to retain the cube limits.

Every rule here remains provisional until the proof. There is no shipped asset, item model, generator integration, or manifest change in this pull request. The isolated proof deliberately contains an invalid mixed opaque/blend block to reproduce the recorded BDS failure.

For any failing proof check, record the evidence under a `Probe failure` heading in this ADR and revise the affected rule here. Use a superseding ADR when the design approach changes. The [proof matrix](../../spike/camping-gear-proof/README.md#checks-and-fallbacks) names each fallback, including reduced texture resolution, stepped geometry, geometry cutouts, lower budgets, and fewer hidden variants; never silently substitute one in an item pull request.

## Verification still required

No client, phone, or BDS measurement has run. Generated bounds and counts are offline checks only. Follow [the proof README](../../spike/camping-gear-proof/README.md), record date, device, client/BDS versions, content logs and frame-rate numbers in its results tables, then copy the completed results here in #1606 or earlier if a check fails.

- Verify one-axis cubes, two-axis closure and the diagnostic three-axis loop on PC and phone; verify two-axis assemblies at both pair ends. Check the stepped fallback too.
- Verify 512 x 512 terrain source resolution alongside vanilla 16 x 16 textures, numeral legibility and 4-texel gutters at 8, 16, 32 and 48 blocks; record farther-mip bleeding separately.
- Verify partial alpha cutouts and RGB padding from both sides, including whether `alpha_test_single_sided` loads and keeps the desired visible faces.
- Verify standalone glass translucency and sorting against its opaque core, and opaque-twin glass plus a cutout in `pair_alpha_test`.
- Verify BDS acceptance or rejection of opaque/alpha-test mixing and reproduce the known opaque/blend rejection; leave production methods uniform regardless of an isolated successful mix.
- Measure 128, 256, 512 and 1024 cubes per block and 512 with alpha test, against paired empty baselines on PC and phone. The highest passing count is a device measurement, not an engine maximum; any raised budget needs an explicit ADR revision.
- Compare `pair_hidden` (8192 total, 512 visible) with `budget_512` for frame rate, cold world load time, process-memory change if measurable, and content-log errors on BDS and both clients.
