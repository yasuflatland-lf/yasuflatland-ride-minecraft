# 0170. Measure SUV side-view proportions against a fixed wheel diameter

- Status: Proposed
- Date: 2026-10-27
- Extends: 0009 (model conventions), 0006 (body probes), 0122 (footprint)

## Context

Issue #745 starts a seven-part revision of the SUV silhouette. The current side windows are tall, the hood is short, the windshield is upright, and the axle, sill and bumper positions differ from the owner's reference. The reference is `rubicon_side.png`; `suv_side.png` shows the current vehicle. Both were inspected from the owner's Downloads directory and remain outside the repository. The reference provides proportions only, not branding or real-world dimensions.

### Reference image measurements

The reference is 820 by 380 pixels, with SHA-256 `7c79a50d1c50567bfd6cc153bebcb40ecb1163e9c1ee857426a9e2decdbd0b5c`. Coordinates below start at the upper left, x rightward and y downward. A scratch Python script (not committed) reads the PNG using `struct` and `zlib`, reconstructs its filtered RGB scanlines, averages the three channels, and ranks adjacent-pixel intensity differences in restricted scan intervals. These searches avoid the red annotation circles and lettering. The source images are not repository inputs. The coordinates and search procedure below preserve the measurement evidence independently of that scratch file.

- Tire contact: vertical scans at x=180 and x=669 over y=310..340 both have their strongest edge at y=327, with antialiasing at 328..329. Use ground y=328. Hub centers read at (180,259) and (669,259), supported by horizontal hub edge pairs x=176/183 and 665/673 at y=260. Twice the hub-to-ground distance gives D=138 px for both tires. Horizontal outer edges at x=111 and x=737 on y=260, and x=248 and x=600 on y=275, cross-check the diameter to a few pixels; upper tire edges are partly obscured by the arches.
- Bumper tips: horizontal searches x=45..80 at y=225 and x=745..780 at y=215 give x=54 and x=765. The spare extends farther left and is excluded. L=711 px.
- Roof: x=300, y=15..40 gives the outer edge at y=25; the second edge at 37 is the lower roof border. Use the outer edge, excluding the antenna.
- Sill: scans at x=300, 400 and 480 show the outer running-board band below y=235, dropping from gray to near-black at y=248..249. Use y=249 for the underside of this sill/step. The irregular dark chassis below it ends at y=256..262 and is not the sill. This distinction replaces the initial 0.62 D estimate with 0.572 D; it is not minimum undercarriage clearance.
- Side window: x=300, y=35..125 gives glass borders y=43 and y=117. Their separation is 74 px; the belt line is the lower glass edge, not the door seam.
- Windshield: the outer A-pillar edge is x=471 at y=45 and x=512 at y=105 (horizontal scans x=460..495 and 495..535). Its rake from vertical is atan2(41,60)=34.346 degrees. Extrapolating to the cowl gives x=516 at y=111. A vertical hood scan at x=540 has edges at y=105 (raised detail) and y=111..112 (hood surface). Use the cowl/hood foot (516,111), not the raised detail.
- Bumper inner ends are read visually where the band meets the wheel arch: front x=720, rear x=112. Their dark-on-dark seams do not produce a reliable scanline peak; allow about 5 px reading uncertainty. Lengths are 765-720=45 and 112-54=58 px. The front bumper's vertical scan at x=750 gives y=183..234, hence 51 px. The rear band is thinner (about y=208..241); the single bumper height row uses the larger height, as does the model measurement.

The image is a rendered side view, not a calibrated orthographic drawing. Antialiasing and hidden edges give roughly 2-3 px uncertainty for clear edges, and about 5 px for dark bumper joints. The tolerances below allow 6.9 image px per linear row and 3 degrees for rake. Revisit the landmarks if a better orthographic reference becomes available; do not substitute manufacturer specs.

### Measured targets and current model

`tools/suv_proportions.py` measures the exported, closed-door, unanimated model. The four road wheel bounds give D=12.051808 model px, rather than nominal 12: rotated tread corners reach y=-0.025904 and y=12.025904. The spare is not an anchor. The bumper tips are z=-29.5 and z=33.5, so current L=63 px (3.9375 blocks). The larger 65.12 px total visible span includes lamps and spare and is not L. Axles are z=-17 and z=21 after export's 180-degree turn.

| Measure | Target image px | Target / D | Target / L | Current model px | Current / D | Current / L | Tolerance |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Wheelbase | 489 | 3.5435 | 0.6878 | 38 | 3.1531 | 0.6032 | +/-0.05 D |
| Front overhang | 96 | 0.6957 | 0.1350 | 12.5 | 1.0372 | 0.1984 | +/-0.05 D |
| Rear overhang, spare excluded | 126 | 0.9130 | 0.1772 | 12.5 | 1.0372 | 0.1984 | +/-0.05 D |
| Ground clearance at sill | 79 | 0.5725 | 0.1111 | 4.025904 | 0.3340 | 0.0639 | +/-0.05 D |
| Overall height | 303 | 2.1957 | 0.4262 | 30.325904 | 2.5163 | 0.4814 | +/-0.05 D |
| Belt line above ground | 211 | 1.5290 | 0.2968 | 17.025904 | 1.4127 | 0.2703 | +/-0.05 D |
| Side window height | 74 | 0.5362 | 0.1041 | 11 | 0.9127 | 0.1746 | +/-0.05 D |
| Hood top at windshield foot | 217 | 1.5725 | 0.3052 | 17.025904 | 1.4127 | 0.2703 | +/-0.05 D |
| Hood length, foot to front bumper tip | 249 | 1.8043 | 0.3502 | 16.448311 | 1.3648 | 0.2611 | +/-0.05 D |
| Windshield rake from vertical | 34.346 degrees | n/a | n/a | 25 degrees | n/a | n/a | +/-3 degrees |
| Front bumper length | 45 | 0.3261 | 0.0633 | 6.783866 | 0.5629 | 0.1077 | +/-0.05 D |
| Rear bumper length | 58 | 0.4203 | 0.0816 | 6.639528 | 0.5509 | 0.1054 | +/-0.05 D |
| Bumper height, larger end | 51 | 0.3696 | 0.0717 | 5.5 | 0.4564 | 0.0873 | +/-0.05 D |

The module adapts the measurement and Python bridge from commits `4f7ecc54` and `78f31d86`, including `cube_tilt.cube_matrix` and its vector application. Its bounds transform all eight corners around each cube's pivot. It selects landmarks by bone and shape, without texture colors, list offsets or fixed coordinates: the widest leaning frame supplies the windshield pivot and rake, and its tilted front face, extrapolated to the pivot height, supplies the hood foot like the target's outer A-pillar edge; the large rear side pane in `windows_sealed` supplies the open window's edges; the long outer steps supply the sill. Broad low slabs beyond each axle select bumper bands, including their rotated corners. Tips exclude spare, exhaust, tow hooks and lamp lenses. Height includes roof ribs. These selectors describe the current construction and must be revised explicitly if it changes.

## Decision

- Follow the measured target proportions. Keep the existing road wheels at their current diameter; allow overall length and size to change. The target L/D=5.1522 implies L=62.093 model px at the measured D, about 1.4 percent shorter than the current bumper span. Distribution of that length matters more than the small overall change.
- Keep all colors, `PALETTE`, `BODY_PAINTS`, swatches and texture atlas unchanged. New cubes reuse existing swatches. Preserve bone names, the part list, the eight-slot grille and the no-logo rule (0009). Do not copy brand marks, lettering, emblems or badges.
- Keep every table row in `TARGETS` with its tolerance. `measure(cubes_by_bone)` returns `{pixels, ratio}` for linear rows, where ratio is to measured D. Rake returns `{degrees}`: dividing an angle by a length would break scaling invariance. `PENDING` initially contains all 13 rows. Later PRs remove their completed rows, which activates their tolerance assertions. All rows remain measured and checked for positivity, determinism and uniform-scale invariance. Retain the 60-second scaling property timeout from `69897dd3` for coverage CI.
- Each PR changing the body outline re-derives `SUV_SPEC.bodyFront`, `bodyHalfWidth`, `footprint` and `carHeight`, documents the measured extents, and reviews collision box, seats and placement clearance. Never change driving physics as part of this series. The 1.8 by 1.6 collision box remains square (0009); a longer visible body alone does not enlarge the one-cell `halfX` and `halfZ` clearance. If collision box or clearance changes, explicitly review whether the camper and bulldozer's shared SUV 3 by 3 clearance (0142, 0143) still holds. Review seat positions whenever the cabin moves.
- Guard body-shell forward reach and half width against their game values, and the farthest actual rotated corner of every model bone against `footprint`. The shell is `body` plus closed `door_*` bones: front reach 29.5/16=1.84375, half width 16.5/16=1.03125, within 1.85 and 1.1 respectively. This is not a claim that the probes enclose every decoration: separate lamp lenses reach 29.62/16=1.85125 and wheel hub caps reach 18/16=1.125 on main. These are excluded from the shell checks, but included in the footprint check. Keep the known protrusions bounded separately so later changes cannot grow them unnoticed. The full model's farthest corner remains within 2.35 blocks. Roof-to-road height is 1.895369 blocks; allow a stated 0.30-block roof margin above `carHeight=1.6`, reflecting the accepted visible roof above the collision box. Do not silently increase that margin in subsequent PRs.
- This first PR changes only documentation and measurement/tests. `pnpm model` output must remain byte-identical, with no pack change or version bump.

Implement the following linear stack; each PR title begins with its N/7, links its issue with `Closes #N`, and is assigned to `yasuflatland-lf`:

1. 1/7, #745: this ADR, side-view targets and measurement tool.
2. 2/7, #746: name SUV body dimensions in the generator, preserving output.
3. 3/7, #747: wheelbase and overhangs.
4. 4/7, #748: ground clearance and body height.
5. 5/7, #749: hood length and windshield rake.
6. 6/7, #750: belt line and side window height.
7. 7/7, #751: bumpers, body ends and collision probes; settle remaining targets.

## Consequences

The silhouette can converge row by row without changing the wheel anchor or palette. Pending rows are visibly skipped, not silently accepted as compliant. The measurements replace the issue's preliminary image estimates and do not reuse the earlier branch's ADR text. Uniform scaling and axle-shift properties check that the tool measures geometry rather than returning named constants.

Shape-based landmark selection depends on the model's construction; later rebuilds need a selector review as well as visual comparison. A different side window shape may need a new definition of its representative clear height. The guards do not promise exact engine collision with the silhouette (0009), and the explicit roof and decoration allowances are limitations of the existing main model. Accept this proposal only after the stack meets its targets and the result has been checked in game from PC and touch clients. Revisit the decision if those checks expose rider clipping, placement overlap, or ambiguous landmarks.

## Notes

### 3/7: wheelbase and overhangs (#747)

The generator's axles move from z=17 and -21 to 21 and -21.5, and the tailgate from -32 to -31. The front bumper tip stays at 29.5, so L shrinks from 63 to 62 px against the target's 62.09. At the unchanged D=12.051808 px the wheelbase measures 42.5 px (3.5264 D), the front overhang 8.5 px (0.7053 D) and the rear overhang 11 px (0.9127 D), all within 0.05 D; those three rows leave `PENDING`.

The 8.5 px front overhang leaves little room ahead of a 6 px tire. Each arch foot now sits 6.2 px from its axle (was 7), the arch's flat top is 7 px long (was 8) and the flares are 1.5 px thick (was 2), so the front flare ends behind the bumper tip and the slopes still clear the spinning tread. Both bumpers end at the body's 13 px half width instead of reaching over the tires (16 and 15.5 px), since their straight bands now sit beside the tread; their length and height stay for 7/7. The hood's lower side reaches back to the front door's hinge, because the front flare no longer hides the gap there. A property test in `tests/packs/model.test.ts` keeps every spinning road tire clear of the body and door cubes.

The cabin, doors, B-pillars and seats do not move, so the seat positions in `suv.se.json` stay. The body shell reaches 1.846875 blocks forward and 1.03125 to the side, and the farthest corner of any bone is 2.3423 blocks from the center, so `bodyFront` 1.85, `bodyHalfWidth` 1.1 and `footprint` 2.35 stay: the front ram probe reaches as far as before. The collision box (1.8 by 1.6) and the placement clearance (`halfX`, `halfZ` 1) stay, so ADR 0142 and 0143 still hold. Driving physics and colors are unchanged.

### 4/7: ground clearance and body height (#748)

The sill, the underside of the side steps, rises from y=4 to 6.875 px, 6.900904 px above the road at y=-0.025904: 0.572603 D against the target's 0.572464 D, so `ground_clearance` leaves `PENDING`. The chassis slab, the exhaust and its locator, the tow hooks and the rear bumper hang from the sill and rise with it. The front bumper does not: its top stays on the grille's bottom frame at y=8, because the grille and the round headlights above it do not move, and a front bumper raised with the sill would bury the grille's lower edge and the bottoms of the headlights. Both bumpers' lengths and heights stay for 7/7. The front flare's vertical leg now ends 1 px above the sill, as it did before; the flares' rotated slopes, the arch feet and the road wheels do not move, and the spinning-tire clearance property still passes.

The cabin floor rises 1 px, from y=7 to 8, only so the steps keep a 1.125 px running board (the target's band is about 1.2 px) whose top meets the doors' lower edge, so an opening door slides over the step instead of cutting through it. The doors, B-pillars, arch liners, cargo floor and tailgate start at the new floor; the floor-mounted levers and pedals follow it. The seats, the `seat_*` bones and the rider positions in `suv.se.json` stay, and the cushions' lower 1 px is now hidden in the floor. #748 suggests moving the whole cabin up with the floor, but the roof guard above takes precedence: `BELT_Y` 17, `WINDOW_TOP_Y` 27, `ROOF_Y` 29 and `HOOD_TOP_Y` 17 stay, and lifting the riders under an unchanged roof would only take their head room. The lower body side therefore shortens from 13 to 10.125 px between sill and belt (0.840 D; the target's is 132/138=0.957 D, which 6/7 settles with the belt line).

Overall height stays 30.325904 px (2.516 D, 1.895369 blocks), within `carHeight` 1.6 plus the existing 0.30-block roof margin but above the target's 2.196 D. The lower body cannot bring it down, so `overall_height` stays pending until 6/7 lowers the windows and roof.

The body shell still reaches 1.846875 blocks forward and 1.03125 to the side, and the farthest corner of any bone is 2.3423 blocks from the center, so `bodyFront` 1.85, `bodyHalfWidth` 1.1, `footprint` 2.35 and `carHeight` 1.6 stay. The collision box (1.8 by 1.6) and the placement clearance (`halfX`, `halfZ` 1) stay, so ADR 0142 and 0143 still hold. Driving physics and colors are unchanged.
