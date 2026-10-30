# 0190. A ribbed camper shell atlas, trim, and roof rails

- Status: Accepted
- Date: 2026-10-30
- Related: [0067](0067-camper.md), [0091](0091-alpha-blend-only-the-camper-glass.md), [0157](0157-an-aluminium-rimmed-louvred-camper-vent-lid.md), [0076](0076-per-kind-default-paint.md)
- Pull requests: #962 (1/7), #963 (2/7), #966 (3/7), #967 (4/7), #965 (5/7), #964 (6/7)

## Context

The panel shell design in issue #954 calls for horizontal ribs, metal edges, grey-beige window trim, and roof rails. The existing camper uses one palette texel per face. Building fine ribs from cubes would add geometry, while an atlas can paint the groove and gloss into the existing shell. The whole side wall needs a shared height reference through the 64 px roof height so ribs on separate cubes line up.

## Decision

- Keep row 0 as the swatch row with every existing index unchanged. Append `aluminium` (168, 170, 168), a dull metal, and `trim_beige` (214, 211, 202), a grey-beige a notch darker than the white shell. Allocate rectangular atlas regions append-only below the swatch row through `camper_atlas.Atlas`.
- Allocate one rib region, 8 by `ROOF * RIB_TEXELS_PER_PX` texels (8 by 128), covering the whole side wall. The atlas contains `rib`, `door_head`, `door_hinge`, `door_latch`, `vent_screws`, and `bolt` regions. Row `dy` from the region's top maps to model height `y = dy / RIB_TEXELS_PER_PX` above y = 0, so separate cubes share the same rib phase. Keep `RIB_PERIOD_TEXELS = 4` and `RIB_TEXELS_PER_PX = 2` in the camper generator: one horizontal rib per two model pixels. The one-model-pixel period aliased into uneven bands in the generated side preview, and the reference photo shows flat panel bands between grooves. Keep the period in one constant and the rib region height a multiple of it.
- Apply ribs only to both side walls. Each period has a groove at 93% of the existing white shell RGB and a highlight one texel below at 105%, clamped to 255, followed by two flat shell texels. This paints gloss into the white shell without PBR. Front, rear, and roof stay plain. Region texels use the fixed shell color, independent of accent paints.
- Repaints continue to change only `khaki`, `stripe`, and `tan` (0067, 0076). The shell and trim stay fixed. All 16 textures share the atlas dimensions. Lit color textures preserve region pixels and transparent unused space; every region or unused MER texel uses `MER_OFF`.
- Use aluminium for the door frame and roof edge, with bolt heads along the roof edge. Use grey-beige trim for window frames. Keep rail and trim dimensions in camper-specific constants, rather than sharing another vehicle's tuning.
- Add a roof rail on slim posts along each side edge of the roof. Keep the rails and posts inside the body's footprint in both x and z. They are visual geometry only: the hitbox, roof cell, and room blocks stay unchanged.
- Retain the opaque shell and separate alpha-blended glass bones of 0091. The atlas lifts the one-row texture limit that Proposed ADR 0157 worked around, without changing the lid.
- The atlas was introduced before mapping cubes to its regions in issue #956. The completed shell maps side walls and door hardware, adds trim and roof-edge bolts, and places rails on slim posts as the remaining parts of #954.

## Consequences

The texture grows while remaining small and repetitive enough to compress well. Palette UVs remain compatible, and paints cannot recolor the ribs. Tests check paint invariance, atlas bounds and overlaps, and non-emissive region texels. The rail adds visual height without changing clearance checks. The accepted two-model-pixel rib period reduces the aliasing of the original alternating stripe and preserves flat bands between grooves. Fine ribs and bolt heads may still shimmer on mobile or at a distance; revisit the tuning if in-game viewing reveals a concrete problem.
