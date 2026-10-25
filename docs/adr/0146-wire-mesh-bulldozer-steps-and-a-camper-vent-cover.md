# 0146. Wire mesh bulldozer steps and a camper vent cover

- Status: Proposed
- Date: 2026-10-25
- Extends: 0091, 0113, 0136

## Context

The owner asks for wire mesh steps beside the bulldozer cab front and a mesh vent cover in place of the camper's rear-right shower-toilet window (#597). The bulldozer deck currently has solid orange plates with dark dots.

The opaque `entity` material ignores alpha (0020, 0115). Only glass uses `entity_alphablend`, and the engine does not sort the cubes within an entity (0091). No pack uses `entity_alphatest`. Each model uses an N x 1 palette texture with one swatch per face; a drawn mesh texture would require a taller atlas, new UVs, and changes to all sixteen paint textures. The roof fan grilles and SUV hood vent already use cubes over dark backing.

## Decision

- Use opaque crossed layers of thin cubes over dark backing, with existing swatches only. Keep the palette order, texture dimensions, textures, materials, bones, locators, and render controllers unchanged. Put every new cube in `body`.
- Replace the bulldozer's orange plates and dot grid with `step_mesh(x0, z0, x1, z1)`, mirrored through `both(side)`. The build-frame footprint is x 12.8 to 17.3 and z 7.4 to 13.0, ending 0.2 px before the door diagonal. Set `STEP_MESH_PITCH = 1.0`, `STEP_MESH_BAR = 0.4`, and `STEP_MESH_FRAME = 0.5` px. Four steel edge cubes rise from `DECK = 24.5` to 24.75. The inside hole-colored backing rises to 24.55, steel bars along z occupy y 24.55 to 24.65, and steel bars along x occupy y 24.65 to 24.75. The layers avoid overlapping coplanar visible faces; all cubes stay inside the footprint and below the door's lowest cube at y 25.
- Remove the camper's right-side window at z 38 to 50, y 36 to 49 from `right_windows`. The shared wall generator closes the outer white wall, inner lining, and khaki band and removes that window's frame, glass, and curtains. Keep the counter window and all other windows unchanged.
- Set `VENT_COVER = (41.5, 49.5, 38.0, 46.0)` as z0, z1, y0, y1. On the right outer wall, add four chrome bezel cubes 0.8 px wide at x 24.1 to 24.5, black inside backing at x 24.1 to 24.2, slat bars along y at x 24.2 to 24.3, and slat bars along z at x 24.3 to 24.4. Use `VENT_MESH_PITCH = 1.0` and `VENT_MESH_BAR = 0.4` px. The generator mirrors this build-frame +x side to Bedrock -x. The 8 x 8 px cover stays within the khaki band and clear of the stripe and low rear hatch.
- Regenerate the geometry and previews and raise the Resource Pack to 0.1.127 (0015).

## Consequences

The mesh is opaque: nothing shows through its dark cells. The 0.4 px bars may shimmer at a distance, which offline previews cannot show. Manual rows B24 and C164 check the appearance on PC and mobile; keep this ADR Proposed until those checks pass.

The vent cover has no inside part. The toilet, its deck seat (0095), shower, seats, ceiling lights, entry door, and shower-toilet door are unchanged, as are the preceding exterior touchups. ADR 0113's wording about the rear window is now historical; the right side reads front window, door, counter window, wall with vent.

Hit boxes, tracks, and the bulldozer door exit (0141) are unchanged: model cubes do not participate in collision or exit logic. The highest step remains below the door. Tests check the mesh layers, gaps, symmetry, bounds, swatches, wall closure, and existing glass bone contract. No game test or BDS change is needed for this model-only change.
