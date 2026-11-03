# 0210. Derive the ground tent lean from the reference photos

- Status: Proposed
- Acceptance condition: repository checks and CI in-game scenarios pass, and the owner confirms the regenerated tent silhouette
- Date: 2026-11-03
- Supersedes in part: [0209](0209-lay-the-ground-tent-as-a-trapezoid-of-stepped-cells.md): lean value, side-wall widths, body ceiling, side flaps, rooms, cell counts, and layout version
- Extends: [0208](0208-fold-tents-with-older-layouts-on-load.md): fold version-2 trapezoid tents when loading layout version 3
- Related: [0010](0010-testing-strategy.md)
- Related: [0015](0015-dev-server-docker-nethernet.md)

## Context

Issue #1238 replaces the estimated common lean of 1.2 blocks with pixel
measurements taken after inspecting every owner reference photo.
The issue attributes the lean statement to 0208, but it lives in 0209. This
also replaces the Lean row of the shared contract in parent issue #1222.

The nearly orthographic end view, `big_tent_shape_from_the_other_side_of_entrance.png`
(562 x 376 px), has ridge corners at x 193 and 373 on the y 150 eave line,
and ground corners at x 65 and 505 on y 292. Its ridge/base width ratio is
180/440 = 0.41. Eave height/base width is 142/440 = 0.32, and peak height/base
width is 181/440 = 0.41. The entrance view behind the tarp,
`big_tent_shape_from_entrance.png`, gives 0.41 to 0.53 depending on whether the
roof lip is counted.

On `panel_parts_explanation.png` (2944 x 1478 px, displayed at 2000 px width),
the side top from the front top corner to the rear vertical edge measures
600 px against a 1230 px base: 0.49. On `big_tent_shape.png` (565 x 351 px),
the ridge is 163 px against a 342 px base: 0.48, or 0.59 with the overhanging
roof cap. The part 5/6 comparison gave about 0.54. The measured side range is
0.46 to 0.56. Perspective, the cap, and the asymmetric entrance/rear faces
prevent a single symmetric trapezoid from matching every view.

## Decision

Replace `TENT_SPEC.lean` with `leanWidth = 2.05` blocks per side along x and
`leanDepth = 1.3` blocks per end along depth. Keep the 7 x 6 body base and
three-block model ridge. Ridge width is 7 - 2*2.05 = 2.9 blocks, or 41 percent;
ridge depth is 6 - 2*1.3 = 3.4 blocks, or 57 percent. The front ratio matches
the measured end view. A side ratio near 0.49 would require about 1.5 blocks
of depth lean, but that loses standing space in the domain layout.

The domain keeps `H = frontRoomHeadroom + 1 = 4`. At height y its half width
is `3.5 - leanWidth*y/H`, front is `3 + leanDepth*y/H`, and rear is
`9 - leanDepth*y/H`. A depth lean above 4/3 moves the layer-1 cross-walls to
depths 4 and 7, removing the body front room and the second standing bedroom
column. Choose 1.3 as the largest round value below 4/3 with margin. Preserve
the two free standing layers in the tarp, the body front room at depth 4,
x -1..1, and the bedroom at depths 6..7, x -1..1. The bedroom flap at x 0,
depth 5 connects the rooms. Never add a cell outside the intended shell to
recover this space.

Derive side-wall half widths and the body ceiling half width by flooring the
shell at their layer centres. Cross-wall insets remain [0, 0, 1]. Keep four
wall-plate faces and every block definition. The complete revised cell contract
is:

| Part                    | Local cells                                                          |
| ----------------------- | -------------------------------------------------------------------- |
| Side walls              | Half widths [3, 2, 2] at layers 0, 1, 2; depths 4..7                 |
| Front/rear cross-walls  | Depths 3/8 at layers 0..1, 4/7 at layer 2; exclude side-wall columns |
| Inner wall              | Depth 5; exclude side-wall columns                                   |
| Body ceiling            | x -1..1, depths 4..7, layer 3                                        |
| Tarp ceiling and bridge | x -2..2, depths 0..3, layer 2                                        |
| Front flap              | x -1..1, depth 3, layers 0..1                                        |
| Left flap               | (3, 4, 0), (2, 4, 1)                                                 |
| Right flap              | (-3, 4, 0), (-2, 4, 1)                                               |
| Bedroom flap            | x 0, depth 5, layers 0..1                                            |
| Mattresses              | x +1/-1, depths 6..7, layer 0                                        |
| Lantern                 | (0, 4, 3), replacing a body ceiling cell                             |
| Tarp room               | x -2..2, depths 0..2, layers 0..1                                    |
| Body lower room         | x -2..2, depths 4..7, layer 0                                        |
| Body standing room      | x -1..1, depths 4..7, layers 0..1                                    |
| Body upper room         | x -1..1, depths 5..6, layer 2                                        |

There are 93 unique laid cells: 45 ordinary walls, 12 flap cells across four
IDs, 31 ordinary ceilings, one lantern, and four cells for two mattresses.
The raw layout contains 57 wall cells and 32 ceiling cells before flap and
lantern substitution. The anchor remains (0, 8, 0); clear space stays x -3..3,
depths 0..8, layers 0..3: 252 cells and 63 support columns.

Every laid centre stays inside the body or tarp shell. The outer-wall rule
needs no relaxation: the outward cell face remains within 0.5 block of the
shell (centre distance 0..1). Its largest centre distance is 0.73125 blocks
at the layer-1 side walls. The body ceiling centre at y 3.5 has half width
1.70625, so x +/-2 is excluded; depth centres 4.5..7.5 fit the front/rear
bounds 4.1375..7.8625. Side flaps remain wall cells. With the flaps open, the
layer-1 cell outside x +/-2 is unlaid and outside the body shell. The lower
body edge room columns at x +/-2 are sheltered by the layer-1 side wall;
they are not standing columns. The narrower body ceiling shelters the central
standing columns; the tarp ceiling still bridges the entrance.

Bump `TENT_LAYOUT_VERSION` to 3 because laid cells change. The 0208 fold path
selects every registry entry below the current version on the first loop tick.
Its fixed layout-1 cleanup box also covers all version-2 cells, so all earlier
pitched tents, including the part 1/6 through 6/6 layouts, fold automatically
on load rather than leave saved blocks behind. Preserve occupant ejection,
non-tent blocks, and the single plain-item refund.

Mirror the constants in `Dims` as `lean_width = 32.8` and `lean_depth = 20.8`
model pixels. Side panels use the width lean; end panels, end tilt angles,
entrance frames, and front-face attachments use the depth lean. Existing tarp
formulas consume the two axes without changing the tarp connection design,
the side triangle design, or the side panel split (owner decisions 7 to 9).
Derive the inner roof width from the outer side at its roof top (y 40.5),
with shell-thickness plus seam-width clearance (1.5 px). The inner top half
width becomes 26.825 px; clip its rear roof and side courses under the leaning
rear face. Keep the entrance and mesh windows within their faces. Derive strap
ends and ring positions from the shortened ridge, and keep the hook and cap
inside its depth range -67.2..-12.8 px. Keep lantern and mattress pivots.
Regenerate through `pnpm model`, and bump the Resource Pack header, module, and
Behavior Pack dependency from 0.1.246 to 0.1.247 (0015).

## Consequences

The end silhouette now matches the measured width ratio. The symmetric side
ratio remains 57 percent to preserve standing space, slightly wider than the
measured 46 to 56 percent range. The photos show a near-vertical entrance face
and a strongly leaning rear wedge, which one symmetric depth lean cannot show.

The domain shell still spans H = 4 blocks while the model leans over 3 blocks.
At height 2.5 the visible half width is about 1.792 blocks, so the layer-2
side-wall centres x +/-2 sit about 0.2 block outside the visible panels.
The layer-3 ceiling centres at height 3.5 sit above the visible ridge at 3.
These are remaining visual/cell differences, not permission to place centres
outside the domain shell. Ridge height/base width remains 3/7 = 0.43 against
the measured peak ratio 0.41 and eave ratio 0.32; the fixed ridge height does
not independently reproduce the photos' roof lip.

Front, left-side, front-left, and front-right renders support silhouette review;
automated shell, room, aperture, and fixture checks do not establish device
appearance or collision behavior. CI must run the in-game scenarios. Revisit
this compromise if the owner changes the standing-room requirement, permits
asymmetric ends, or asks to reconcile the model and domain height conventions.
