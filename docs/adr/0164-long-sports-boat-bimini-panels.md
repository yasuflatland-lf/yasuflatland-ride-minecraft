# 0164. Long sports boat bimini panels

- Status: Proposed
- Date: 2026-10-26
- Extends: [0051](0051-sports-boat.md) (bimini construction)

## Context

The bimini's transverse 2 px slices show stair steps from the side and above. The owner wants a gently domed soft top, a rolled front lip, and one darker hatch. The roof series runs in order: 1/3 #647 (top panels), 2/3 #648 (main side skirts), then 3/3 #649 (rear corner skirts and removal of the slice loop). Each later branch starts on the previous branch. Only #639's rotation-aware `pair()` and generator `--check` are prerequisites. The hull series (0161-0163) is already on this branch's main base.

Before this step the Bimini block contains 75 cubes, excluding the tower and speakers: ten slices with one top, two ribs and four rolled-edge cubes each, plus five hatch boxes. The complete starting model has 1166 cubes.

## Decision

- Keep `B_REAR = -10`, `B_FRONT = 9`, `B_HALF = 19`, `B_TOP = 36`, and `B_THICK = 2` in the generator's build frame, where +z is the bow. Define `dome(z) = B_TOP - 1.5 t + 0.6 (1 - (2t - 1)^2)`, with `t = (z - B_REAR) / (B_FRONT - B_REAR)`; the old discrete drop term is removed.
- Declare ordered `ROOF_PANELS` entries `(name, z0, z1, y0, y1)`: `ROOF_REAR` spans -10..-3 with dome endpoints; `ROOF_MAIN` spans -3..6 with dome endpoints; `ROOF_LIP` spans 6..9 from `dome(6)` to `dome(9) - 2.4`. `roof_top(z)` linearly interpolates the applicable panel, clamping outside the nominal range. It replaces every `bimini_top()` call, including the speakers' underside height, without changing their shapes.
- Build each top as one canvas cube from x -16 to 16, without the former corner trim, with 2 px thickness square to the surface and nominal length `hypot(z1 - z0, y1 - y0)`. Pivot at the rear top edge `(0, y0, z0)`. Rotate about x only, using `atan2(y1 - y0, z1 - z0)` degrees in the build frame. This corrects the opposite sign in #647's explicit formula: under 0051's in-game convention a negative x turn tips +y toward +z, so a surface falling toward +z needs a negative x turn. `turn_around()` negates it for the shipped geometry. Keep even the rear panel's small rotation (about 0.048 degrees) for exact endpoints. The preview renderer uses the opposite x sign; device verification is still required.
- Extend each panel's local length at each internal joint by `max(0.25, B_THICK * tan(abs(angle change)) / 2 + 0.05)`, using radians for the tangent. Both neighbours receive that allowance; outer ends get none. These overlaps use the same canvas swatch. The nominal top heights remain fixed at panel endpoints.
- Replace the five hatch boxes with one canvas_panel cube, x -9..9, 0.25 px thick above the main surface. Use the main panel's pivot and x rotation, with local distances that project its bottom edge to build z -2..5. The hatch stays inside the main footprint.
- Delete all 20 underside ribs, with no replacement: they are hidden from normal views. Keep the 40 existing rolled-edge cubes and their corner widths and slice ranges, setting their heights from `roof_top(zc)`. Main and rear skirts are deferred to 2/3 and 3/3. Do not change the tower, board racks, mirror, bow rails, speaker shapes, textures, swatches, or gameplay.
- Bump the Resource Pack header and module and the Behavior Pack's Resource Pack dependency from 0.1.147 to 0.1.148 (0015).

## Consequences

This step reduces the Bimini block from 75 to 44 cubes: three top panels, one hatch, and 40 rolled-edge cubes. Removing ten sliced tops, 20 ribs, and five hatch boxes and adding four cubes saves 31. The complete model drops from 1166 to 1135 cubes. No extra closure cube is added. The series' final budget remains at most eight cubes: three tops, one hatch, two main skirts, and two rear skirts. Later steps update this Proposed ADR in place.

The rear and main chords deviate from the dome by about 0.081 and 0.135 px at their midpoints. Automated geometry checks pin the in-game x sign, normal thickness, nominal endpoints, joint allowances and intersecting joint volumes, hatch placement, rib removal, and cube count. The sliced side edges remain visible until the later steps. Device check B25 in [the manual checklist](../manual-test.md) remains pending on PC and mobile: inspect the roof from the side and above for a gentle dome, rolled front lip, one darker hatch, and no top stair steps. Previews and server tests cannot establish client rendering or sorting.
