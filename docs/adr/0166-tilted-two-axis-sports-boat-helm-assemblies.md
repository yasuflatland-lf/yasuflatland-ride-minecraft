# 0166. Tilted two-axis assemblies on the sports boat helm

- Status: Proposed
- Date: 2026-10-26
- Extends: [0009](0009-vehicle-model-conventions.md) (one rotation axis per cube), [0051](0051-sports-boat.md) (x rotation sign)

## Context

The owner wants the sports boat's helm to look like a modern boat helm: the steering wheel tilted 30 degrees and the display tilted 45 degrees, both with the top leaning away from the driver, plus a painted switch plate and a controller block. The work runs as a series, one pull request per step, each branched on the previous one (1/7 to 7/7, issues #664 to #670): 1/7 adds a painted tile registry, 2/7 adds the helper and this ADR, 3/7 (this step too) adds a PBR clear coat to the dash swatches, 4/7 reworks the display, 5/7 tilts the wheel, 6/7 adds the switch plate and 7/7 the controller block.

ADR 0009 allows one rotation axis per cube. That is enough for the display, which is a single plate turned about x. The wheel is different: its 40 rim segments (three rings, so 120 cubes), spokes and chrome strips are each turned about z, the wheel's own axis. Tilting the wheel turns all of them about x as well, so a tilted wheel is an assembly of cubes that each carry two non-zero rotation axes.

## Decision

- `tilt_assembly(cubes, pivot, axis, degrees)` in `tools/cube_tilt.py` (re-exported by `tools/gen_sportsboat.py` next to `pair()`) moves a list of cubes rigidly, as one body, about the world line through `pivot` along `axis`. Only `"x"` is supported. Each cube's `origin`, `pivot` and `rotation` are rewritten, and `degrees == 0` returns unchanged copies. A cube without a `pivot` gets its origin as pivot.
- `degrees` has the sign of a cube's x rotation, so tilting a cube turned `[rx, 0, 0]` gives `[rx + degrees, 0, 0]`. A negative value tips +y toward +z before the 180-degree turn, which is a top leaning away from the driver (ADR 0051).
- Composition order assumed: `tools/render_preview.py` negates the x and z turns (`game_turn`) and then applies x, then y, then z about the cube's pivot, so a cube with game rotation `[rx, ry, rz]` has the matrix `Rz(-rz) * Ry(ry) * Rx(-rx)` in the preview's math. This is the order Blockbench uses for Bedrock models (z outermost, x innermost) and the same convention the existing x and z rotations were pinned against in game (0051, 0058). The tilt multiplies the cube's matrix on the left by `Rx(-degrees)`, and the product is decomposed back into the same order, with gimbal lock (y at +-90 degrees) putting the whole turn on z. A cube turned `[0, 0, rz]` ends up with `Rx(-a) * Rz(-rz)` in that order.
- `ONE_AXIS_EXCEPTION` lists the assemblies that may carry a two-axis rotation. Today it holds only `"wheel"`, used by 5/7. `tilt_assembly` takes an optional `assembly` name and raises if a result would have more than one non-zero axis and the name is not listed. The shipped-model test allows multiple non-zero axes only on the 134 wheel cubes and checks their composed matrices; every other cube still has at most one non-zero axis.
- In-game check: the order above is an assumption made from the preview and from earlier in-game pins, not a measurement of a two-axis cube. 5/7 is not done until a device check (a row in `docs/manual-test.md`) shows the tilted wheel with no skew of the rim. If the game composes the axes in another order, change the one function and regenerate.
- Tests: property tests (fast-check) show that tilting by `a` and then `-a` returns the original cubes within 1e-9, that the distance between any two cube pivots is preserved, and that the composed matrix of a tilted cube equals `Rx(-a) * Rz(-rz)`.
- Helm cube count (the block "Helm console ... throttle", including the passenger console, the cupholders and the throttle): 164 before this step and 164 after. The whole model stays at 1109 cubes, and the generated `sportsboat.geo.json` does not change.
- No Resource Pack change in 2/7, so the manifest versions stayed as they are there.
- 3/7, dash clear coat (extends [0163](0163-a-glossy-clear-coat-sports-boat-hull.md)): `MER_GLOSS = (0, 0, 24)` (metalness 0, emissive 0, roughness 24/255) is written to the `gloss` and `frame` swatch cells (`GLOSS_SLOTS`, 16 texels each) of every paint atlas's MER image, next to `MER_HULL` on the hull cell. Roughness 24 is slightly softer than the hull's 16, so the large flat dash reflects the sky and light softly rather than mirroring like water. Every other texel stays `MER_OFF`, and the lamp and mirror atlases are unchanged. Colour atlases, UVs and `sportsboat.geo.json` do not change, so previews and item icons stay as they are. Tests pin all MER texels of the 16 paint atlases.
- Cubes that use `gloss` or `frame`, and so all change look together (by region): the helm dash, the passenger console and their tops; the display and its side panel and the switch plate; the steering wheel's pad centre, cap-side parts, cowl and column; the throttle housing and lever arm; the cupholder inserts; the engine tunnel, centre housing, keel and bores and the dash rail; the cone; the rear-view mirror stem and bar; the speaker mount and each speaker's back disc; and the `frame` rails, posts and cross bars of the windshield, bimini side rail and tower rack. If the owner wants a region left flat, it needs its own swatch.
- Helm cube count: 164 before 3/7 and 164 after; the model stays at its cube count because this step changes no geometry.
- Resource Pack and Behavior Pack dependency manifests go to 0.1.157 for 3/7, because the MER images change.
- Open question for the owner: on a Vibrant Visuals device the dash, consoles and display bezel should show soft sky and light reflections (manual test row B31). The verdict is recorded here once known.

### Painted tile registry (1/7, #664)

Use the insertion-ordered `TILES` dict in `tools/gen_sportsboat.py` for painted atlas rectangles. Each entry holds `uv`, `size`, and a `paint(pixels)` callable that draws into the atlas rows. Keep `quilt` at `[0, 16]`, size `[8, 8]`, and `mirror` at `[16, 16]`, size `[16, 8]`. Module-level validation rejects non-positive sizes, out-of-atlas rectangles, overlaps between tiles, and overlaps with the swatch row (y 0..3). The atlas remains 128 x 32.

`tile_faces(name)` supplies one face's UV dict. `box(..., faces=None, tiles=None, **extra)` keeps `faces` as shorthand for quilted faces; explicit `tiles={face: name}` takes precedence. The atlas writer calls each registered painter, so later display, switch plate, wheel pad and controller tiles need no atlas-writer changes. The mirror gradient and MER glass bounds use the registry allocation. Tests read the registry and generated atlas to pin allocations and existing tile pixels.

This refactor preserves every generated geometry, texture, MER and preview byte. Helm cubes remain 164 before and 164 after (1109 across the model). No rotation changes, new tiles, manifest bump or device check are needed; the existing negative x sign remains unchanged.

### Steering wheel tilted 30 degrees (5/7, #668)

`WHEEL_TILT = -30` tips the top toward +z before `turn_around`, away from the driver at -z (0051). The rigid assembly uses `tilt_assembly(..., pivot=[WX, WY, WZ + 0.4], axis="x", degrees=WHEEL_TILT, assembly="wheel")`, with `WX = 7.6`, `WY = F + 7.5 = 16.8`, and `WZ = 7.0`. The pivot is `[7.6, 16.8, 7.4]`, or `[-7.6, 16.8, -7.4]` in the generated game frame. WZ moves by **0.0 px**: the current position already clears the floor and consoles, so no retreat toward the driver is needed. The lowest wheel corner is y 13.9470, above `F + 4.5 = 13.8`. Corners at z >= 9 in the generator frame are above the console boxes.

All three 40-segment rim rings, spokes, strips, buttons, both `disc()` pad cubes, both plain silver cap cubes and the LED stay inside the 134-cube assembly. The complete assembly's centroid follows the rigid transform; the symmetric rim's centroid stays at the pivot. The wheel-local composed y angle is reversed before the existing `turn_around` runs: that function already reverses x but retains z under the legacy wheel convention (0058). Reversing y too preserves the shipped matrix `Rx(-30) * Rz(-rz)` rather than skewing different segments into different planes. No other assembly's transformation changes. `render_preview.py` already applies `Rz(-rz) * Ry(ry) * Rx(-rx)` through `game_turn` and `rotate`, including README and item previews, so it needs no change.

The cowl, chrome cap and column remain three cubes, each turned about x only through the same pivot. In the untilted local frame, the cowl spans `WX +- 1.0`, `WY - 0.9 .. WY + 0.3`, `WZ + 0.7 .. 9.0`; its chrome band spans `WX +- 1.05`, `WY - 0.95 .. WY + 0.35`, `WZ + 1.5 .. WZ + 1.7`. The column spans `WX +- 0.7`, `F + 3 .. WY - 0.9`, `WZ + 0.7 .. WZ + 1.5`. Both glossy parts start at the pad's rear face, `WZ + 0.7`. The column's upper front edge meets the lower pad rear face with no gap; all three support cubes stay behind the pad's rear plane.

Recounted from the generated geometry and the console-to-throttle block: **164 helm cubes before and 164 after**, comprising 134 wheel cubes, 3 column/cowl cubes and 27 other helm cubes. The current whole model stays at 1225 cubes (later hull, roof and speaker changes account for the increase since 2/7's historical 1109). Exactly 128 wheel cubes carry multiple non-zero Euler axes; the remaining six reduce to one axis. Tests check every wheel cube's composed matrix, the rim normal and centroid, the full assembly centroid, floor/console/display corner clearances, and column contact without penetration. They read the generated JSON and do not run the generator.

The display-plate clearance check is skipped because 4/7 does not exist yet. Clearance uses the current display instead: the gloss box x 2.0..9.0, y `F + 8 .. F + 12.4`, z 13..14, and its screen face box, both rotated -20 about x on `SCREEN_PIVOT`. The display geometry is unchanged. The regenerated model and previews change; the regenerated color and MER atlases stay unchanged. Resource Pack header/module and Behavior Pack Resource Pack dependency versions advance from 0.1.157 to **0.1.158**.

Open question for the owner (manual test B30): on PC and mobile, does the wheel look round and lean away by about 30 degrees from the driver's seat, without rim or spoke skew, with the column meeting the hub? Does the in-game rotation order match the preview? **Verdict: unverified, awaiting the owner's device check.** No BDS or in-game test is run for this step.

### Switch plate with six painted round buttons (6/7, #669)

The flat `gloss` plate and its six `metal` button cubes are replaced by one `gloss` plate, `SWITCH_TILT = -20` about x only (top leaning toward +z like the display, so the same negative sign, 0051). The plate has footprint `x 12.8..15.0`, `z 11.8..14.6` (shifted +1.2 px by 7/7) along the slope, is 0.4 thick (was 0.3) and pivots at its low edge on the dash, `[13.9, F + 8, 14.6]`, so that edge stays on the dash and the other rises by about 1 px toward the driver. Only that one axis is rotated, so the one-axis rule of 0009 holds and `ONE_AXIS_EXCEPTION` is unchanged.

The buttons are painted. The registry tile `switch_plate` (`tools/tile_layout.py`) is `[40, 4]`, size `[20, 24]`, in the free area right of the swatch row, so the atlas stays 128 x 32. It shows a slightly lighter recessed panel with rounded corners inside the black plate, and six round 5 x 5 buttons in a zigzag of 1, 2, 2, 1 from the top (the far end of the plate), the two-button rows offset to the left and then the right. Each button is a light grey ring with a one-texel dark outline around a near-white centre. There is no text, icon or sticker. Only the plate's `up` face uses the tile; its other faces use the `gloss` swatch. I chose no raised caps: the 5-texel buttons are about 0.55 px wide, and 0166's caps (radius 0.45) would hide the ring, so the count stays at one cube.

Helm cube count: 164 before 6/7 and 158 after (the old 7 cubes, plate and 6 buttons, become 1). The whole model goes from 1225 to 1219 cubes. The generated geometry, the colour and lamp atlases and the mirror atlas change by the new tile's texels only; swatch cells and the MER images stay as they are. Resource Pack header/module and Behavior Pack Resource Pack dependency versions advance from 0.1.158 to **0.1.159**.

Corner-transform tests check that the tilted plate stays on the dash and does not intersect the phone holder, its screen, the display and its screen face, or the throttle housing. The display-plate clearance check is skipped because 4/7 does not exist: the current display (gloss box with the -20 tilt) is used. They read the generated JSON and do not run the generator.

Open question for the owner (manual test B32): from the driver's seat, does the plate read as a glossy slanted black plate with six round chrome-ring buttons in a zigzag? **Verdict: unverified, awaiting the owner's device check.** The previews cannot show the tile, since `render_preview.py` shades each face with one colour.

### Controller pad with a knob (7/7, #670)

Use one 3.0 x 0.4 x 3.0 `gloss` pad at x 12.0..15.0, y F+8..F+8.4, z 8.8..11.8, pivot [13.5, F+8, 11.8]. Its x rotation is `SWITCH_TILT = -20`, the same negative sign as the switch plate (0051); no other axis rotates. The raised -z end intentionally overhangs the ledge at y F+7, while the low edge rests on the dash at F+8. The requested strip cannot contain a free 3 x 3 pad, so the switch plate moves exactly +1.2 px to z 11.8..14.6, pivot z 14.6. It remains inside the dash edge z 15.5 and clear of the phone holder at x 11.0..12.4.

The `control_pad` tile occupies [64, 4], size [16, 16], without growing the 128 x 32 atlas or moving existing tiles or swatches. It paints a dark square with cut corners, a lighter dial-base ring of about five texels radius, four outlined rounded buttons (upper left, wide top-centre, lower left and lower right) and one tiny upper-right button. Each has a generic three-texel dot mark, with no text or branding. Tile top is the far end, as for `switch_plate`.

Two crossing `button` bars, footprints 1.8 x 1.0 and 1.0 x 1.8, approximate the round knob within three cubes. Both are centred at x 13.5, z 10.3, start on the pad at F+8.4 and rise 0.5. A 0.6 x 0.6 `steel` cap sits on the bars at F+8.9 and rises 0.1. All three share the pad's pivot and x-only rotation. A disc or cylinder would require a second rotation axis when tilted; the 0009 exception is limited to the wheel, so the knob uses crossing bars instead. Contact tests check the bars against the pad and the cap against the bars.

4/7 does not exist in this stack: every new-display-plate check is skipped. Corner-transform AABB checks use the current display on main: gloss box x 2.0..9.0, y F+8..F+12.4, z 13..14 plus its screen face, both rotated -20 about x on SCREEN_PIVOT. They also check the switch plate, phone holder and screen, all 134 tilted wheel cubes, and throttle housing.

Final helm counts (console-through-throttle block, including passenger console and cupholders):

| Parts | Before the series | After 6/7 | After 7/7 |
|---|---:|---:|---:|
| Other helm parts, including the current display and tilted wheel | 157 | 157 | 157 |
| Switch plate and raised buttons | 7 | 1 | 1 |
| Controller pad | 0 | 0 | 1 |
| Controller knob | 0 | 0 | 3 |
| Total helm cubes | 164 | 158 | 162 |
| New helm parts from 6/7 and 7/7 (cap: 5) | 0 | 1 | 5 |

Counting the generated geometry confirms 1219 -> 1223 whole-model cubes for this step. The historical pre-series model count was 1109; unrelated changes already present in the stack account for the difference. Generated geometry, color atlases and previews change; regeneration leaves MER images unchanged. Resource Pack header/module and Behavior Pack dependency versions advance from 0.1.159 to **0.1.160** because generated assets change.

Open question for the owner (manual test B33): on PC and mobile, does the controller beside the switch plate read as a glossy chamfered pad with a large round knob, four small buttons and a tiny upper-right button, without clipping? Compare the regenerated sportsboat previews for placement; their flat face shading does not show painted button detail. **Verdict: unverified, awaiting the owner's device check.**

### Display tilted 45 degrees with a glossy bezel and a painted UI (4/7, #667)

`SCREEN_TILT = -45` about x only (top toward +z, away from the driver, the negative sign of 0051), on the unchanged `SCREEN_PIVOT = [5.5, F + 8, 13.5]`. The two display boxes are replaced in place: a `gloss` frame, x 2.0..9.0, 4.4 px along the slope and 0.6 thick (was 1.0), and a `screen` face, x 2.4..8.6, 3.6 px along the slope and 0.1 thick, on the frame's driver-side (-z) surface. The frame is 0.4 px wider than the face on every edge, which reads as the raised bezel, so no rim plates are added. The face's driver-side face uses the new registry tile `display`; its other five faces use the `screen` swatch.

The tile `display` is `[84, 4]`, size `[24, 12]`, right of `control_pad`, so the atlas stays 128 x 32. It paints a dark navy screen with two blue-arc gauges around soft blue glows, three vertical sliders with red markers, a row of six tab marks along the top (the middle one light blue), bar meters at the far left and right, a row of small icons along the bottom and a yellow and a red corner triangle. It has no text, digits or logos. Tile top is the top of the screen.

Placement. The thick plate tilted 45 degrees would drop its rear bottom corner 0.21 px below the dash (y F + 8), so both cubes are lifted by 0.2121 px along world y (local y +0.15, z -0.15 on the fixed pivot). This is the only adjustment; the tilt is unchanged and the plate height is not reduced. The tilted frame stays inside the cockpit: its lowest corner is at F + 8 and its top edge is 1.26 px below the windshield top rail (`RAIL_Y`) and 0.53 px from the front glass plane, so the plate does not cut the glass.

Clearance against 5/7 to 7/7. These parts were built against the old 20 degree display. Tests now check the transformed corners of the new frame and face against all 134 wheel cubes, the switch plate, the phone holder and its screen, the controller pad and knob, and the throttle housing. None of them clips, so none moved. The earlier "4/7 does not exist" notes in 5/7 to 7/7 above refer to the 20 degree display and are superseded by this section.

Helm cube count: 162 before 4/7 and 162 after (the display stays two cubes). The whole model stays at 1223 cubes. Generated geometry, colour atlases and previews change; the MER images stay as they are. Resource Pack header/module and Behavior Pack dependency versions advance from 0.1.160 to **0.1.161**.

Open question for the owner (manual test B34): from the driver's seat, is the display a glossy slanted panel leaning away by about 45 degrees with the painted gauges and icons, and does it clip neither the dash nor the windshield? **Verdict: unverified, awaiting the owner's device check.** Previews shade each face with one colour and cannot show the tile.

## Consequences

- 5/7 tilts the wheel by one helper call instead of hand-composing angles, and the exception stays limited to the wheel.
- A cube with two rotation axes is harder to edit by hand and is only trusted after the device check; the helper is the only way the series adds one.
- Later steps of the series edit this ADR in place while it stays Proposed.
