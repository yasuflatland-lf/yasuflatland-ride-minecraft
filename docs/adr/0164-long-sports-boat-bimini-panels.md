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
- Delete all 20 underside ribs and all 40 original rolled-edge cubes, without replacement ribs. The final roof uses only the panels below and the hatch.

| Panel | Build z range | Cubes | Construction |
|---|---|---:|---|
| `ROOF_REAR` | -10..-3 | 1 | 2 px canvas top, nearly level (height change below 0.01 px) |
| `ROOF_MAIN` | -3..6 | 1 | 2 px canvas top carrying the hatch |
| `ROOF_LIP` | 6..9 | 1 | 2 px canvas top, front endpoint lowered by 2.4 px |
| Hatch | -2..5 | 1 | 0.25 px canvas_panel sheet on the main top |
| `SKIRT_MAIN` | -3..6 | 2 | 0.8 px canvas sheets, x 16..19, outer edge 2.6 px lower |
| `SKIRT_REAR` | -10..-3 | 2 | 0.8 px canvas sheets, x 16..18, outer edge 3.6 px lower |

- Keep the step 2/3 main skirts over z -3..6. Their z-only angle is `atan2(2.6, 3.0)` (40.9 degrees), pivoted at `(16, roof_top(6) - 0.3, 1.5)` on the right. The inner edge stays inside the main top's thickness despite its 0.95 px fall.
- Build each rear corner skirt as one level sheet, because the rear top changes height by less than 0.01 px. Its right pivot is `(16, roof_top(-10) - 0.3, -6.5)`, its z-only angle is `atan2(3.6, 2.0)` (60.9 degrees), and its local width is `hypot(2.0, 3.6)`. The outer edge sits 1 px inboard of the main skirt and drops farther, making the rear corner a visible steeper step. For both skirts, the build-frame turn is negative on the right to lower the +x end; `pair()` negates it on the left, and `turn_around()` keeps the written z angle (0058).
- Do not build `LIP_EDGE`: the lip's own 2 px side face supplies the rolled edge. No extra closure cube is needed by the design; confirm this in the regenerated top and rear previews and on device. The cap remains eight cubes.
- Remove the entire roof slice loop and its corner-width locals. Keep `SLICE` for the hull and `roof_top()` for the unchanged speakers. Do not change the tower, board racks, mirror, bow rails, speaker shapes, textures, swatches, or gameplay.
- Set the Resource Pack header and module and the Behavior Pack's Resource Pack dependency to 0.1.150 (0015), following 0.1.148 in step 1/3 and 0.1.149 in step 2/3.

## Consequences

Step 1/3 reduces the Bimini block from 75 to 44 cubes: three top panels, one hatch, and 40 rolled-edge cubes. The complete model drops from 1166 to 1135 cubes. Step 2/3 removes 16 rolled-edge cubes and adds two main skirts, taking the block from 44 to 30 cubes and the model to 1121 cubes. Step 3/3 removes the remaining 24 rolled-edge cubes and adds two rear skirts: 30 - 24 + 2 = 8 Bimini cubes, and 1121 - 24 + 2 = 1099 model cubes. The final roof is seven canvas panels plus one hatch, down from 75 to 8 cubes, excluding the unchanged speakers, tower and racks. No extra closure cube is added.

The rear and main chords deviate from the dome by about 0.081 and 0.135 px at their midpoints. Automated geometry checks pin the in-game rotation signs, thickness, nominal endpoints, joint allowances and intersecting joint volumes, hatch placement, mirrored skirt drops, rib and slice removal, single-axis rotations, and cube count. Device checks B25 and B26 in [the manual checklist](../manual-test.md) remain pending on PC and mobile: compare the regenerated `docs/images/sportsboat-top.png` and `docs/images/sportsboat-rear.png`, then inspect the roof from the side, above and rear-left for the three top panels, darker hatch, rolled front lip and sloping skirts with a steeper rear corner step. Previews and server tests cannot establish client rendering or sorting.
