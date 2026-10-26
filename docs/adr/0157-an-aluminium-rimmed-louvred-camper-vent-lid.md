# 0157. An aluminium-rimmed louvred camper vent lid

- Status: Proposed
- Date: 2026-10-26
- Supersedes in part: [0146](0146-wire-mesh-bulldozer-steps-and-a-camper-vent-cover.md) (the camper vent cover's look)

## Context

ADR 0146 put a square wire mesh vent cover on the camper's rear-right wall: an 8 x 8 px chrome bezel around crossed slat bars over black backing. In the previews it reads as a checkered grid. The owner asks for a lid like the one on their reference photo instead: a rounded rectangle with a thin aluminium frame and small screws around a body-colored panel, about twelve thin horizontal louvre slits in a left and a right column over the upper two thirds, and a plain lower part with a small latch at the bottom.

The constraints from 0146 still hold: the opaque `entity` material ignores alpha, and each model uses an N x 1 palette texture with one swatch per face, so the louvres are built from cubes, not drawn into a texture.

## Decision

- Keep 0146's wall closure, its position on the right outer wall, and the bulldozer steps. Replace only the cover's look.
- Grow the lid to `VENT_COVER = (40.5, 49.5, 36.5, 48.5)` (z0, z1, y0, y1): 9 px wide and 12 px tall, still inside the removed window's opening and the khaki band.
- Rim: chrome cubes from the band's outer face (x 24.1 in the build frame) to x 24.5, `VENT_RIM = 0.7` px wide, with each outer corner cut by `VENT_CORNER = 0.35` px so the lid reads as a rounded rectangle. Six steel screw heads, 0.3 px square and 0.05 px proud, sit on the top and bottom rim at both ends and the middle.
- Panel: white, x 24.1 to 24.3, 0.2 px below the rim. Two columns of `VENT_SLITS = 12` slits each, `VENT_SLIT = 0.25` px tall at a `VENT_SLIT_PITCH = 0.6` px pitch from 0.5 px under the panel's top, with 0.5 px side margins and a 0.8 px middle gap (`VENT_SLIT_MARGIN`, `VENT_SLIT_GAP`). Each slit is a hole in the panel with black backing 0.1 px deep, so the slits are recessed, not painted. The lower part has no slits; a steel latch, 1.2 x 0.6 px and 0.25 px proud of the panel, sits near its bottom center.
- Use existing swatches only (chrome, white, black, steel). Keep the palette, textures, materials, bones, locators, and render controllers unchanged; every cube stays in `body`. The generator mirrors the build-frame +x side to Bedrock -x as before.
- Regenerate the geometry and previews and raise the Resource Pack to 0.1.138 (0015).

## Consequences

The lid has 92 small cubes instead of the mesh's bars. The 0.25 px slits may shimmer or merge at a distance, which offline previews cannot show. The panel uses the white body swatch, so it does not follow the accent paint. Manual row C164 checks the look on PC and mobile; keep this ADR Proposed until it passes. Nothing inside the camper changes, and model cubes take no part in collision. Tests check the rim's bounds and cut corners, the swatches, the two slit columns and their recess, and the latch.
