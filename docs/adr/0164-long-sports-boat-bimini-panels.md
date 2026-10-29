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
- Build each top as one canvas cube from x -16 to 16, without the former corner trim, with 2 px thickness square to the surface and nominal length `hypot(z1 - z0, y1 - y0)`. Pivot at the rear top edge `(0, y0, z0)`. Rotate about x only, using `atan2(y1 - y0, z1 - z0)` degrees in the build frame. This corrects the opposite sign in #647's explicit formula: under 0051's in-game convention a negative x turn tips +y toward +z, so a surface falling toward +z needs a negative x turn. `turn_around()` negates it for the shipped geometry. Keep even the rear panel's small rotation (about 0.048 degrees) for exact endpoints. The preview renderer's `collect_boat()` applies `game_turn()` to account for the opposite raw x/z signs (0051, 0058); device verification is still required.
- Extend each panel's local length at each internal joint by `max(0.25, B_THICK * tan(abs(angle change)) / 2 + 0.05)`, using radians for the tangent. Both neighbours receive that allowance; outer ends get none. These overlaps use the same canvas swatch. The nominal top heights remain fixed at panel endpoints.
- Replace the five hatch boxes with one canvas_panel cube, x -9..9, 0.25 px thick above the main surface. Use the main panel's pivot and x rotation, with local distances that project its bottom edge to build z -2..5. The hatch stays inside the main footprint.
- Delete all 20 underside ribs and all 40 original rolled-edge cubes, without replacement ribs. The final roof uses only the panels below and the hatch.

| Panel | Build z range | Cubes | Construction |
|---|---|---:|---|
| `ROOF_REAR` | -10..-3 | 1 | 2 px canvas top, nearly level (height change below 0.01 px) |
| `ROOF_MAIN` | -3..6 | 1 | 2 px canvas top carrying the hatch |
| `ROOF_LIP` | 6..9 | 1 | 2 px canvas top, front endpoint lowered by 2.4 px |
| Hatch | -2..5 | 1 | 0.25 px canvas_panel sheet on the main top |
| Continuous side roll | -10..9 | 6 | Three 0.8 px canvas chords per side at 15, 30 and 45 degrees, x 16..19, total drop 2.6 px |
| Rear/main bridges | -10..6.25 | 2 | Thin level side plates buried in the top panels and roll |
| Lip bridges | 6..9, with rear overlap | 2 | Thin side plates parallel to the lip, x rotation only |
| Roll backing | -10..9 | 4 | Two concealed overlapping plates per side close both end triangles |

- Use one uninterrupted cube per roll sheet per side over the entire build z -10..9. The three horizontal runs are 0.300, approximately 0.427 and 2.273 px; each drop is its run times the tangent of its angle. This preserves the 3 px reach and 2.6 px total drop. Start at `(16, roof_top(9), -0.5)` on the right and chain the nominal endpoints. The shoulder is level at y 32.1 and the nominal outer edge at y 29.5. At the front the shoulder meets the lip's top edge; farther aft it lies inside or below the thicker top panels. Retain negative right build-frame z turns and mirrored left turns. No cube needs more than one rotation axis.
- Extend both neighbours at each roll joint by `max(0.25, 0.8 * tan(angle change) / 2 + 0.05)` along their local widths, giving 0.25 px per neighbour. Thickness extends inward; the outer endpoint stays at x 19. The physical outer hem, including the 0.8 px sheet thickness, is y `29.5 - 0.8 cos(45 degrees)`, approximately 28.934.
- Remove `SKIRT_REAR`: its inset, steeper drop made the visible rear step the owner wants removed. Extending the same three level sheets to both ends also removes the main/rear and main/lip end faces. Do not add a separate `LIP_EDGE` or a slope-following roll with compound rotations.
- The roof falls 3.9 px from rear to front, so the level roll alone would leave a rear opening. Bridge the top to the roll at x 15.8..16.1. One level plate per side spans -10..6.25, from y 31.7 to 34.1. Its upper edge is inside both rear and main top panels (rear underside about 34, main top at least 34.956), so splitting it at -3 gains nothing. One additional plate per side uses the lip's pivot and x rotation, extends its local rear edge by 0.25 px, and has local thickness `(roof_top(6) - roof_top(9) + 0.03) * cos(lip angle)`. Its lower plane at z 6 is 0.03 px below the shoulder. The plates overlap each other, the top and the roll. Their transformed corners stay above the physical hem and inside x 19. This closes the gaps with four bridge cubes; three separate pairs parallel to each top panel would need six.
- Remove all twelve old stepped end plates at z -10, -3 and 6. Two continuous concealed backing plates per side close both remaining end triangles at z -10 and 9 at once, using four cubes rather than eight short end plates. Their build x ranges are 15.8..16.95 and 16.7..17.9, their tops are 0.65 and 1.6 px below the shoulder, and their common floor is 0.1 px below the nominal outer edge, above the physical hem. Their outer upper corners are buried in the rolled sheets. Nothing projects outside x 19 or below the outer hem, and none of these backing plates introduces a join along z.
- Remove the entire roof slice loop and its corner-width locals. Keep `SLICE` for the hull and `roof_top()` for the unchanged speakers. Do not change the tower, board racks, mirror, bow rails, speaker shapes, textures, swatches, or gameplay.
- Set the Resource Pack header and module and the Behavior Pack's Resource Pack dependency to 0.1.154 (0015), the next patch after fetching `origin/main`, which is at 0.1.153.

## Consequences

The original slice-based Bimini had 75 cubes and the complete model had 1166. The three-panel roof series reduced those counts to 8 and 1099. The subsequent rounded main roll and stepped end closures brought them to 24 and 1115, the starting point for this follow-up. Replacing the six short main sheets, two rear sheets and twelve stepped caps with six continuous sheets, four bridge plates and four continuous backing plates reduces the Bimini from 24 to 18 cubes and the whole model from 1115 to 1109. The final Bimini is seventeen canvas cubes plus one hatch; enforce an eighteen-cube cap, excluding the unchanged speakers, tower and racks.

The rear and main top chords deviate from the dome by about 0.081 and 0.135 px at their midpoints. Automated geometry checks use the in-game corner transforms and ray intersections to pin top endpoints and overlaps, hatch placement, mirrored signs, full-length sheets, outward-steepening angles, intersecting roll joints, gap-free side coverage, opaque end triangles, buried backing corners, the outer silhouette, single-axis rotations and the final cube count. The same roll runs continuously from rear to front without a notch, seam or rear step; the concealed bridges absorb the changing top height.

Device checks B25 and B26 in [the manual checklist](../manual-test.md) remain pending on PC and mobile. Compare the regenerated top, rear and afloat previews and a temporary rear-left view from above, then inspect the roof from rear-left, side and front-left above: one continuous rounded roll from rear to front, no step, with both end triangles closed. The x sign still follows 0051 and the z sign remains unchanged; previews and server tests cannot establish client rendering or sorting.
