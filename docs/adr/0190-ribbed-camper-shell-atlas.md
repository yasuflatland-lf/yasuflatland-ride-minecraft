# 0190. A ribbed camper shell atlas and trim

- Status: Proposed
- Acceptance condition: owner decision pending (see #1193)
- Date: 2026-10-30
- Related: [0067](0067-camper.md)
- Related: [0076](0076-per-kind-default-paint.md)
- Related: [0091](0091-alpha-blend-only-the-camper-glass.md)
- Related: [0157](0157-an-aluminium-rimmed-louvred-camper-vent-lid.md)
- Pull requests: #962, #963, #966, #967, #965, #964, #968

## Context

The panel shell design in issue #954 calls for horizontal ribs, metal edges, and grey-beige window trim. The existing camper uses one palette texel per face. Building fine ribs from cubes would add geometry, while an atlas can paint the groove and gloss into the existing shell. The whole side wall needs a shared height reference through the 64 px roof height so ribs on separate cubes line up.

## Decision

- Register `carpet v3` (74 x 222, CARPET), `wall veneer` (416 x 180, WOOD), `backsplash tile` (124 x 152, TILE), and `table oak` (168 x 144, WOOD) before packing the shared atlas. Their pixel functions preserve the reference bytes independently of sampling order. Surface and curtain fabric faces retain their explicit region bindings for audits; remaining faces bind to the registered region containing their complete UV rectangle, including `base` and the door finishes of 0227. Faces outside every registered region fail generation. The `light curtain fabric` region (96 x 120, FABRIC) is registered after the four interior surfaces, before packing. The floor uses 2, veneer 4, tile 8 and oak 12 texels per model pixel. The packed dimensions and region origins depend on the registered set; golden comparisons report placement differences during the incremental port. Companion textures use the same packed layout.

- Keep row 0 within the `base` region as the swatch row with every existing index unchanged. Append `aluminium` (168, 170, 168), a dull metal, and `trim_beige` (214, 211, 202), a grey-beige a notch darker than the white shell. Keep the existing swatches and hardware in one 114 by 220 `base` region; nested coordinates stay relative to its origin through `camper_atlas.RegisteredAtlas`. Register named regions with `camper_regions.RegionRegistry`, using immutable `Region` records and `Material` classifications. Resolve geometry UVs through `RegionRef.uv` after packing, rather than computing atlas offsets in feature builders.
- Pack registered regions deterministically with MaxRects, fixed width candidates and seeded orders, without rotation or resampling. Reserve two transparent texels between regions by default, trim unused outer space, and preserve the exact dimensions and origin `(0, 0)` when `base` is alone. Render RGBA bytes from each region's local pixel function. Before writing textures, audit rectangle bounds and overlaps, exact region pixels, and both endpoints of every emitted geometry face against its assigned region. Transparent gutters do not provide edge dilation; filtering on clients remains unverified.
- Allocate one rib region, 8 by `ROOF * RIB_TEXELS_PER_PX` texels (8 by 128), covering the whole side wall. The atlas contains `rib`, `door_head`, `door_hinge`, `door_latch`, `vent_screws`, and `bolt` regions. Row `dy` from the region's top maps to model height `y = ROOF - dy / RIB_TEXELS_PER_PX` (anchored at the cube's top edge, where Bedrock draws a side face's top uv edge), so separate cubes share the same rib phase. Keep `RIB_PERIOD_TEXELS = 4` and `RIB_TEXELS_PER_PX = 2` in the camper generator: one horizontal rib per two model pixels. The one-model-pixel period aliased into uneven bands in the generated side preview, and the reference photo shows flat panel bands between grooves. Keep the period in one constant and the rib region height a multiple of it.
- Apply ribs only to both side walls. Each period has a groove at 93% of the existing white shell RGB and a highlight one texel below at 105%, clamped to 255, followed by two flat shell texels. The diffuse atlas bakes this gloss; the non-emissive interior MER adds dielectric roughness 85 across the rib region when PBR is available. Front, rear, and roof stay plain. Region texels use the fixed shell color, independent of accent paints.
- Generate one khaki colour atlas, `camper.png`, from the fixed palette (0067, 0076). The base render controller uses `Texture.default` directly, without a paint array or variant lookup. Remove per-paint textures, paint events, and paint groups; keep `minecraft:variant` so saved entities load and can be normalized to 0. The khaki band, brown stripe, tan skirt, shell, and trim retain their colours. Lit, glow, and mirror pass contracts remain unchanged. All four companion maps follow `Layout.size`; their masks resolve the nested swatches and mirror tile through the `base` origin. Lit colour textures preserve region pixels and transparent unused space; the lit MER uses `MER_OFF` outside its five lamp/glow swatches and the mirror MER uses it outside `mirror_chrome`. Generate `camper_interior_mer.png` with alpha 255 and G = 0 everywhere, including gutters. `camper.texture_set.json` binds it to colour `camper` in format 1.16.100. The existing `Texture.default` / `entity` base pass supports this binding without changing the separate lit, glow or mirror passes. Without Vibrant Visuals, interior surfaces retain their diffuse colour; legacy lamps retain their separate alpha-mask glow. Normal and height maps remain out of scope because entity support is unverified.
- Use aluminium for the door frame and roof edge, with bolt heads along the roof edge. Use grey-beige trim for window frames. Keep trim dimensions in camper-specific constants, rather than sharing another vehicle's tuning.
- Draw door and vent hardware through four aluminium atlas regions: `door_head` (18 by 3), `door_hinge` (3 by 26), `door_latch` (3 by 26), and `vent_screws` (16 by 3). Their darker hardware texels (`HARDWARE_DARK_FACTOR`) are placed to read as a head bar, hinge knuckles, latch, and screws in the per-texel camper preview and in game; the camper preview maps each texel, with only uniform faces falling back to centre sampling. The vent lid of 0157 now has a `trim_beige` panel and an aluminium top rail whose west face carries `vent_screws`.
- Retain the opaque shell and separate alpha-blended glass bones of 0091. The atlas lifts the one-row texture limit that Proposed ADR 0157 worked around, without changing the lid.
- The atlas was introduced before mapping cubes to its regions in issue #956. The completed shell maps side walls and door hardware and adds trim and roof-edge bolts as the remaining parts of #954.

The rails from #964 were removed at the owner's request in [issue #970](https://github.com/yasuflatland-lf/yasuflatland-ride-minecraft/issues/970) and [pull request #973](https://github.com/yasuflatland-lf/yasuflatland-ride-minecraft/pull/973).

## Consequences

Registry and packer property tests cover determinism, separation, bounds, UV resolution, and one-byte corruption. The base-only migration preserves generated geometry and PNG bytes. The texture grows while remaining small and repetitive enough to compress well. Palette UVs remain compatible, and paints cannot recolor the ribs. Tests check paint invariance, atlas bounds and overlaps, and non-emissive region texels. The two-model-pixel rib period reduces the aliasing of the original alternating stripe and preserves flat bands between grooves. Fine ribs and bolt heads may still shimmer on mobile or at a distance; keep this decision Proposed until the completed shell is checked in game from the side and three-quarter view at chase-camera distance on PC and mobile, widening the rib period if needed.

## Addendum: round camper hover glows (2026-10-31)

Issue #1032 extends the camper's bone contract (0009, 0067) with `glow_fl`,
`glow_fr`, `glow_rl`, and `glow_rr`, each a child of `body` centered at the
existing `hover_*` locator. Each disc uses 16 turned squares with corner radius
`WHEEL_R` (7.8 px) and spans y = -0.5 to 0, below the folded wheel. This applies
0022 to the camper using its own wheel dimensions.

Append a cyan `glow` swatch (80, 170, 255, alpha 40) without moving existing
swatches. Only `glow_*` uses `entity_emissive_alpha`; the opaque shell, blended
glass, and separately switched lamps retain their materials. The main render
controller shows the discs when `yasu_ride:gear_down` is false, matching the SUV
and the camper's wheel fold controller. The lamp pass keeps them hidden. Existing
hover particles and locators stay unchanged. Ground-pose camper previews omit
the glow bones, matching the render controller.

The discs look bright without lighting nearby blocks. Collision, seats, driving,
and other part colors do not change. The owner must check the flight appearance
in game, including the particles over the discs.
