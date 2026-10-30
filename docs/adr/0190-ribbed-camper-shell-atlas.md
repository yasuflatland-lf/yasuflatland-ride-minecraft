# 0190. A ribbed camper shell atlas, trim, and roof rails

- Status: Proposed
- Date: 2026-10-30
- Related: [0067](0067-camper.md), [0091](0091-alpha-blend-only-the-camper-glass.md), [0157](0157-an-aluminium-rimmed-louvred-camper-vent-lid.md), [0076](0076-per-kind-default-paint.md)

## Context

The panel shell design in issue #954 calls for horizontal ribs, metal edges, grey-beige window trim, and roof rails. The existing camper uses one palette texel per face. Building fine ribs from cubes would add geometry, while an atlas can paint the groove and gloss into the existing shell. The whole side wall needs a shared height reference through the 64 px roof height so ribs on separate cubes line up.

## Decision

- Keep row 0 as the swatch row with every existing index unchanged. Append `aluminium` (168, 170, 168), a dull metal, and `trim_beige` (214, 211, 202), a grey-beige a notch darker than the white shell. Allocate rectangular atlas regions append-only below the swatch row through `camper_atlas.Atlas`.
- Allocate one rib region, 8 by `ROOF * RIB_TEXELS_PER_PX` texels (8 by 128), covering the whole side wall. The atlas becomes 38 by 129 texels. Row `dy` from the region's top maps to model height `y = ROOF - dy / RIB_TEXELS_PER_PX` (anchored at the cube's top edge, where Bedrock draws a side face's top uv edge), so separate cubes share the same rib phase. Keep `RIB_PERIOD_TEXELS = 2` and `RIB_TEXELS_PER_PX = 2` in the camper generator: one horizontal rib per model pixel. The period has one source so a two-model-pixel fallback requires one edit.
- Apply ribs only to both side walls. Each period has a groove at 93% of the existing white shell RGB and a highlight one texel below at 105%, clamped to 255. This paints gloss into the white shell without PBR. Front, rear, and roof stay plain. Region texels use the fixed shell color, independent of accent paints.
- Repaints continue to change only `khaki`, `stripe`, and `tan` (0067, 0076). The shell and trim stay fixed. All 16 textures share the atlas dimensions. Lit color textures preserve region pixels and transparent unused space; every region or unused MER texel uses `MER_OFF`.
- Use aluminium for the door frame and roof edge, with bolt heads along the roof edge. Use grey-beige trim for window frames. Keep rail and trim dimensions in camper-specific constants, rather than sharing another vehicle's tuning.
- Draw door and vent hardware through four aluminium atlas regions: `door_head` (18 by 3), `door_hinge` (3 by 26), `door_latch` (3 by 26), and `vent_screws` (16 by 3). Their darker hardware texels (`HARDWARE_DARK_FACTOR`) sit off each region's centre texel, because `render_preview` colours a face from its centre texel and would otherwise shade the whole post. The vent lid of 0157 now has a `trim_beige` panel and an aluminium top rail whose west face carries `vent_screws`.
- Add a roof rail on slim posts along each side edge of the roof. Keep the rails and posts inside the body's footprint in both x and z. They are visual geometry only: the hitbox, roof cell, and room blocks stay unchanged.
- Retain the opaque shell and separate alpha-blended glass bones of 0091. The atlas lifts the one-row texture limit that Proposed ADR 0157 worked around, without changing the lid.
- Introduce the atlas before mapping any cubes to its regions. In issue #956, cube UVs and all geometry except `texture_width` and `texture_height` stay unchanged; side-wall mapping, trim, bolts, and rails follow in the remaining parts of #954.

## Consequences

The texture grows while remaining small and repetitive enough to compress well. Palette UVs remain compatible, and paints cannot recolor the ribs. Tests check paint invariance, atlas bounds and overlaps, and non-emissive region texels. The rail adds visual height without changing clearance checks. Fine ribs and bolt heads may shimmer on mobile or at a distance; keep this decision Proposed until the completed shell is checked in game, and widen the rib period if needed.
