# 0233. Add round shapes and terrain operations to the Build Wand

- Status: Accepted
- Decided in: #1401
- Date: 2026-11-06
- Supersedes in part: [0198](0198-one-build-wand-without-a-bulldozer.md): Decision 11's single edit limit for terrain operations
- Supersedes in part: [0201](0201-build-wand-cylinder-and-cube.md): Decision 6's exclusion of spheres and sideways cylinders
- Extends: [0230](0230-cut-a-selection-with-the-build-wand.md): terrain editing with shared protections
- Related: [0232](0232-undo-skips-conflicting-cells.md): conflict handling after an irreversible edit

## Context

The owner wants round buildings, clearing above an area, filling connected hollows below it, and automatic escape when an edit buries its player. The design note records the choices and their limits. Terrain operations need to cover an area of about 30 by 30 without stalling the server or accidentally destroying terrain without warning.

## Decision

1. Offer Sphere on boxes and horizontal rectangles, opening contents directly at the selected height. Fit an ellipsoid to the selected box; Fill includes cells within its normalized distance and Hollow keeps inside cells with an outside six-neighbor. Apply the existing placed-count limit and Undo.
2. Offer Sideways cylinder on the same selections, also opening contents directly. Its axis is the dominant horizontal look axis when chosen, with x winning ties; retain that axis through preview and placement. Fit the elliptical cross section to the box, extending it along the full axis. Offer Fill, Hollow with closed ends, and Tube with open ends, under the existing limit and Undo. Both shapes keep the minimal box of their Fill cells selected after building and record the pre-build selection for Undo (ADR 0201).
3. Offer Remove above and Fill below on every selection shape, using the selected x and z extents. Limit each side to `BUILD_SPEC.maxTerrainSide = 32`, rather than applying `maxVolume`. Require confirmation naming the operation, area and affected height, and warning that it cannot be undone. For Remove above, also warn that things above can fall. Cancel returns to end-point aiming.
4. Remove above leaves the lower original endpoint layer intact and clears from the next layer through the world top. Fill below starts on the higher original endpoint layer and fills air or fluid connected to that layer through six-neighbor paths. It never writes outside the selected x and z extents or above that layer. Refuse falling materials and materials requiring support. The original endpoints are the two points the player tapped: the live height, Rotate, other edits, and earlier terrain operations on the same selection do not change them, and Cancel returns to aiming from the first one.
5. Run terrain work under the shared per-tick budget with Cut's per-cell protections. Keep no history for these jobs and do not promise Undo in their completion feedback. Undo continues to address the previous undoable edit, skipping conflicts under 0232. Keep the fixed selection outline during confirmation and keep the original box, including its confirmed live height, selected and available for Copy after either operation.
6. After any edit, including build, paste and Undo, move its initiating player only if the job wrote their feet or head cell and either cell is neither air nor liquid at completion. Search upward in the same column for the first cell that has air in it and in the cell above, and teleport to that cell's center at (x+0.5, y, z+0.5), with the player's feet in that cell. Do not move a rider, a player who left or changed dimension, or other players.

## Consequences

The wand gains round shapes and large terrain operations without changing existing edit limits. Confirmation reduces accidental irreversible edits, but protected cells can remain and unsupported things can fall. Filling a slope can leave a cliff at the selection edge, and a player outside the footprint can be walled in. A buried player can take suffocation damage while an edit runs. The decisions require bounded, budgeted scanning and device verification of axis selection and teleport behavior; implementation will update the current spec and manual tests as each feature lands.
