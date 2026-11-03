# SUV body and seats

- Scope: The SUV's model contract, size, collision box, body proportions, and seat positions.
- Verified at: fd83ec4e
- Source: [0009](../adr/0009-vehicle-model-conventions.md)
- Source: [0029](../adr/0029-raise-the-seats.md)
- Source: [0117](../adr/0117-move-the-suv-front-seats-back.md)
- Source: [0170](../adr/0170-measure-suv-side-view-proportions.md)
- Source: [0192](../adr/0192-suv-detailed-body.md)
- Source: [0194](../adr/0194-enlarge-the-suv-for-seated-head-clearance.md)
- Source: [0196](../adr/0196-raise-the-suv-seats-for-first-person-visibility.md)
- Source: [0213](../adr/0213-reproduce-the-reference-suv-shape.md)
- Excluded: [0167](../adr/0167-compound-rotation-assemblies-as-a-vehicle-neutral-rule.md): rotation assemblies, covered by the model-conventions topic
- Excluded: [0176](../adr/0176-move-the-sports-boat-front-seats-back.md): sports boat seat positions, not the SUV

## Rules

### Model orientation and bone contract

- Applies to: SUV model (`geometry.yasu_ride.suv`), all modes.
- Rule: The front of the SUV is the model's -z side. The model has the bones `root`, `body`, `wheel_fl`, `wheel_fr`, `wheel_rl`, `wheel_rr`, `door_fl`, `door_fr`, `door_rl`, `door_rr`, and `seat_0` to `seat_3`. Each wheel bone pivots at the center of its axle and each door bone at its hinge (front edge). The locator `exhaust` marks the exhaust position on `body`.
- Agreement: Accepted
- Basis: [0009](../adr/0009-vehicle-model-conventions.md) Decision, "The front of the entity is the model's -z side"; [0009](../adr/0009-vehicle-model-conventions.md) Decision, "Standardize the bone names as follows: `root`, `body`, `wheel_fl` / `wheel_fr` / `wheel_rl` / `wheel_rr`, `door_fl` / `door_fr` / `door_rl` / `door_rr`, `seat_0`–`seat_3`"; [0009](../adr/0009-vehicle-model-conventions.md) Decision, "Put each wheel bone's pivot at the center of its axle and each door bone's pivot at its hinge (front edge)"; [0009](../adr/0009-vehicle-model-conventions.md) Decision, "Mark the exhaust position with the locator `exhaust`"
- Implementation: `packs/yasu_ride_rp/models/entity/yasu_ride/suv.geo.json`; `tools/gen_model.py`
- Verification: `tests/packs/model.test.ts` "has all the conventional bones", "faces -z: front wheels, front doors and front seats sit at lower z than the rear ones", "has the exhaust locator on body". Not verified: wheel and door pivot positions against the stated pivots (no test reads them), the model in game on any device.

### Seat and door side

- Applies to: SUV model (`geometry.yasu_ride.suv`), all modes.
- Rule: Each `seat_i` and `door_i` bone sits on the same side (sign of x) as the rider `i` in `SUV_PROFILE.seats.positions`. This comes from the implementation's model test, not from an ADR quote.
- Agreement: Accepted
- Basis: [0009](../adr/0009-vehicle-model-conventions.md) Decision, "Standardize the bone names as follows: `root`, `body`, `wheel_fl` / `wheel_fr` / `wheel_rl` / `wheel_rr`, `door_fl` / `door_fr` / `door_rl` / `door_rr`, `seat_0`–`seat_3`" (names only; the same-side pairing is not stated in 0009)
- Implementation: `packs/yasu_ride_rp/models/entity/yasu_ride/suv.geo.json`; `tests/packs/model.test.ts`
- Verification: `tests/packs/model.test.ts` "puts each seat, its door and the same-side wheels on the side SUV_PROFILE.seats.positions names". Not verified: the model in game on any device.

### Lamp bones beyond the 0009 list

- Applies to: SUV model, lit lamp parts.
- Rule: The model also has the bones `headlights`, `tail_lights`, and `headlight_bezels`. Lamp cubes belong to a bone by the part that builds them, not by colour: `headlights` holds the headlight lenses, fog lamp lenses, and the front lamp strip; `tail_lights` holds the lit tail lamp parts and the third brake light; `headlight_bezels` holds the cutout bezel panels and stays in the base pass, so it is not an overlay bone. The round headlights are centred at 18.45 construction px, 0.576 of the span from the grille bottom frame to the hood top. This is the highest centre that clears the grille top frame: the lens top meets its underside at 21.25 px; the 18.5 px reference target would overlap it by 0.05 px. Their 7 px bezels stay 1.8 px below the hood top and clear the eight grille slots.
- Agreement: Proposed
- Basis: [0192](../adr/0192-suv-detailed-body.md) Decision, "Extend 0009 with `tail_lights` for the lit tail lamp parts and the third brake light, and `headlight_bezels` for the cutout panels."; [0192](../adr/0192-suv-detailed-body.md) Decision, "Assign lamp cubes to bones by the part that builds them, not by colour."; [0192](../adr/0192-suv-detailed-body.md) Decision, "`headlights` keeps the headlight lenses, fog lamp lenses and front lamp strip on the fender flares"; [0192](../adr/0192-suv-detailed-body.md) Decision, "`headlight_bezels` stays in the base pass and is not an overlay bone."
- Implementation: `packs/yasu_ride_rp/models/entity/yasu_ride/suv.geo.json`; `tools/suv_lamps.py`
- Verification: `tests/packs/headlights.test.ts` "places both detailed tail faces and the third brake light on the tail bone", "places every light swatch cube on the headlights bone", "keeps two cutout bezels on an origin-pivoted body child in the base pass". Not verified: lamp appearance in game (0192 Decision point 7 and the headlight material result of part 13 are recorded as pending the owner's in-game comparison).

### Grille and marks

- Applies to: SUV model, front grille.
- Rule: The grille has eight slots and carries no logo or vehicle name (a seven-slot grille is a Jeep trademark).
- Agreement: Accepted
- Basis: [0009](../adr/0009-vehicle-model-conventions.md) Decision, "Give the grille eight slots, with no logo or vehicle name."
- Implementation: `tools/suv_shell.py` (`grille_cubes`, `SLOTS`)
- Verification: Not verified: no test counts the grille slots or checks for marks on the model; the slot count is checked by reading the generator only.

### Single size scale

- Applies to: SUV model export, all modes.
- Rule: Construction coordinates stay unscaled. `SIZE_SCALE` in `tools/suv_dims.py` is the one uniform scale that export applies to every length, pivot, locator, and animation translation. Textures, UVs, palette, paint colours, and bone names do not change with it. Its value stays 1.45 with body half width 13 construction pixels anchored to two seated riders (0213), which `tests/tools/suvDimensions.test.ts` asserts. The camper and the bulldozer keep their own geometry and collision boxes.
- Agreement: Proposed
- Basis: [0194](../adr/0194-enlarge-the-suv-for-seated-head-clearance.md) Decision, "Continue applying this one uniform transform at export to every length, pivot, locator and animation translation."; [0194](../adr/0194-enlarge-the-suv-for-seated-head-clearance.md) Decision, "Use `SIZE_SCALE = 1.45` in `tools/suv_dims.py`, an increase of 1.45/1.30, approximately 11.54 percent."; [0213](../adr/0213-reproduce-the-reference-suv-shape.md) Notes, "Keep `SIZE_SCALE=1.45` and body half width 13 construction pixels, anchored to two seated players side by side."
- Implementation: `tools/suv_dims.py` (`SIZE_SCALE`); `tools/suv_export.py`
- Verification: `tests/tools/suvDimensions.test.ts` "keeps scaled SUV dimensions with the observed seat height (ADRs 0194, 0196)" (asserts `SIZE_SCALE`). Not verified: that the 1.45 scale is acceptable on PC or touch (0194 calls it "a first guess, not an accepted client measurement").

### Side-view proportion targets

- Applies to: SUV model, closed doors, unanimated pose.
- Rule: The generated model is measured by `tools/suv_proportions.py` against the 24 rows from 0213: 23 linear ratios to the road wheel diameter and the windshield rake in degrees. `PENDING` lists rows the model does not meet yet and new rows without a landmark; `measure` returns `None` for a pending row without a landmark. Every non-pending row is asserted within tolerance (0.05 D or 3 degrees), and its completed ratio stays within 0.005 of its recorded value. The eight 6/13 massing rows now meet tolerance: wheelbase 3.162, front overhang 0.864, overall height 2.136, windshield rake 24 degrees, overall length 4.976, overall width 2.234, track width 1.874, and tyre width 0.432. The 8/13 (#1253) flares complete `flare_reach` at 0.253296 D and `flare_top_height` at 1.446746 D. 7/13 completes `hood_scoop_height` and `hood_scoop_length`, and 9/13 completes `front_bumper_reach` at 0.333852 D. Two part rows remain pending: `step_height` and `step_reach`. Later PRs of #1245 remove their completed rows from `PENDING`; head clearance and seat comfort take precedence over the reference form.
- Agreement: Proposed
- Basis: [0213](../adr/0213-reproduce-the-reference-suv-shape.md) Decision, "Keep all 24 rows (13 old and 11 new) in `tools/suv_proportions.py`, with 23 linear ratios to road wheel diameter D at tolerance 0.05 D and the windshield rake in degrees at tolerance 3 degrees."; [0213](../adr/0213-reproduce-the-reference-suv-shape.md) Decision, "`PENDING` lists rows the model does not yet meet and new rows without a landmark."; [0213](../adr/0213-reproduce-the-reference-suv-shape.md) Decision, "`measure` returns `None` for a pending row without a landmark."; [0213](../adr/0213-reproduce-the-reference-suv-shape.md) Decision, "Skip pending rows for tolerance assertions and permit missing landmarks only for pending rows; check every non-pending row for positivity and tolerance, and keep its completed ratio within 0.005 of its recorded value."; [0213](../adr/0213-reproduce-the-reference-suv-shape.md) Decision, "Later PRs of #1245 add the landmark selectors for their rows and remove completed rows from `PENDING`."; [0213](../adr/0213-reproduce-the-reference-suv-shape.md) Notes, "All meet the unchanged 0.05 D or 3-degree tolerance."
- Implementation: `tools/suv_proportions.py` (`TARGETS`, `PENDING`, `measure`)
- Verification: `tests/tools/suvProportions.test.ts` "preserves the completed proportions of non-pending rows within 0.005", "reports every row deterministically without mutating cubes", "keeps every row without a landmark in PENDING", "preserves ratios and rake under uniform scaling and reversed cube order"; the active tolerance tests cover all twenty-four measured rows, including the eight massing rows completed in #1251 chunk 1 and the two step rows completed in #1255; `tests/tools/suvSteps.test.ts` checks the rock rail's clearance. No row remains pending. Pending rows' tolerance tests are visibly skipped. These are geometry measurements of the exported model. Not verified: the silhouette on the verification branch in game on the owner's iPad with Vibrant Visuals and PC (0213 acceptance condition).

The 8/13 (#1253) flares use squared panels: a flat top plate, vertical legs, a rubber lip, and a dark wheel-well panel, with a front fender vent. The front crest is 21.75 construction px and the rear crest is 18.5 construction px (about 1.23 D above the road). The flares now define the widest shell point, changing `overall_width` from 2.212395 D to 2.233988 D. The shell half width is 1.5236328125 blocks, below the wheel hub caps at 1.57234375 blocks, so `SUV_BODY_SIZE.shell.halfWidth` and `SUV_SPEC.bodyHalfWidth` remain 1.58 blocks. Collision, seats, and placement clearance remain as recorded below.

The side step is now a rock rail under the doors (ADR [0213](../adr/0213-reproduce-the-reference-suv-shape.md)), with measured face height 0.1246 D and outboard reach 0.0584 D. Its underside retains ground clearance 0.5914 D; geometry tests check clearance from the doors, hover and submarine arms, and wheel arches. This completes the two 10/13 step rows; with 7-9/13 merged, every one of the twenty-four rows is measured and none remains pending.

### Collision box and values derived from it

- Applies to: SUV, all modes.
- Rule: The collision box is a square seen from above, so the front and back of the body stick out of it. Its width stays 1.8 times `SIZE_SCALE` (2.61 blocks). Its height is `(DIMS.greenhouse.roof_top - 0.5) * SIZE_SCALE / 16` (2.838828125 blocks), retaining the 0.5 construction-pixel gap below the roof slab as the roof rises in #1251. `SUV_BODY_SIZE` supplies both values; `tests/packs/behaviorPack.test.ts` checks the pack against them. `SUV_SPEC.carHeight` equals the box height (2.838828125), `SUV_SPEC.hitboxFront` equals half the box width (1.305), `SUV_SPEC.floatDraft` is 0.75 of the box height (2.12912109375), and `SUV_SPEC.gearProbeOffset` is `hitboxFront * (1 - 0.1/0.9)` (1.16).
- Agreement: Proposed
- Basis: [0213](../adr/0213-reproduce-the-reference-suv-shape.md) Notes, "The collision box stays square from above and 2.61 blocks wide."; [0213](../adr/0213-reproduce-the-reference-suv-shape.md) Notes, "Its height becomes `(31.825 - 0.5) * 1.45 / 16 = 2.838828125` blocks, retaining the 0.5 construction-pixel gap below the roof slab."; [0213](../adr/0213-reproduce-the-reference-suv-shape.md) Notes, "`carHeight=2.838828125`, `hitboxFront=1.305`, `floatDraft=2.12912109375`, and `gearProbeOffset=1.16` follow from the box."
- Implementation: `packs/yasu_ride_bp/entities/yasu_ride/suv.se.json` (`minecraft:collision_box`); `src/domain/vehicle/kinds/suv/spec.ts` (`SUV_SPEC`); `src/domain/vehicle/kinds/suv/bodySize.ts` (`SUV_BODY_SIZE`)
- Verification: `tests/packs/behaviorPack.test.ts` "scales the square collision envelope with the SUV (ADR 0170)"; `tests/tools/suvDimensions.test.ts` "keeps scaled SUV dimensions with the observed seat height (ADRs 0194, 0196)". Not verified: wall overlap and door clearance on any client (0194 Consequences).

### Enclosing probes and roof margin

- Applies to: SUV, ram and body probes, vehicle footprint.
- Rule: `SUV_SPEC.bodyFront` and `SUV_SPEC.bodyHalfWidth` enclose the exported shell (`body` plus closed `door_*` bones), the lamp reach (`headlights` bone), and the wheel hub half width. The enclosing values are 3.10 and 1.58 blocks respectively; `SUV_BODY_SIZE.roofTop` is 2.884140625 blocks. `SUV_SPEC.footprint` is 3.95 blocks and encloses the farthest horizontal corner of every bone. Each is rounded up from the measured extent, which is taken from all eight rotated corners of every cube. The visible roof, including ribs, reaches 2.911328125 blocks, 0.0725 above `carHeight`, and stays within the previous measured 0.075-block gap above `SUV_SPEC.carHeight`; the broader ADR allowance of 0.30 blocks must not be used to enlarge this gap. A change to the body outline re-derives these values and reviews the collision box, seats, and placement clearance.
- Agreement: Proposed
- Basis: [0213](../adr/0213-reproduce-the-reference-suv-shape.md) Notes, "Round the enclosing probes upward to `shellFront=3.10`, `shellHalfWidth=1.58`, and `footprint=3.95` blocks"; [0213](../adr/0213-reproduce-the-reference-suv-shape.md) Notes, "`roofTop=2.884140625` blocks follows the 31.825-pixel roof slab top."; [0213](../adr/0213-reproduce-the-reference-suv-shape.md) Notes, "Retain the pre-growth margin below 0.075 blocks; do not enlarge it to the broader 0.30-block allowance."; [0170](../adr/0170-measure-suv-side-view-proportions.md) Decision, "Each PR changing the body outline re-derives `SUV_SPEC.bodyFront`, `bodyHalfWidth`, `footprint` and `carHeight`, documents the measured extents, and reviews collision box, seats and placement clearance."
- Implementation: `src/domain/vehicle/kinds/suv/spec.ts` (`SUV_SPEC.bodyFront`, `bodyHalfWidth`, `footprint`, `carHeight`); `tools/suv_proportions.py`
- Verification: `tests/tools/suvProportions.test.ts` "keeps the body shell inside game probes and the complete model inside its footprint" (derives shell reach, shell half width and roof top from DIMS and checks enclosing probes and the retained 0.075-block roof margin); `tests/packs/model.test.ts` "keeps every hover glow round and inside the vehicle footprint" (checks the enclosing footprint). Not verified: the probes against the engine in game.

The #1251 chunk 2 measurement transforms all eight corners of every exported cube, without rounding before rotation. The shell width below includes the #1253 flares. The enclosing probes round upward to 0.01 block:

| Extent                                                                  | Measured blocks |                Enclosing value |
| ----------------------------------------------------------------------- | --------------: | -----------------------------: |
| Shell forward reach                                                     |      3.08578125 |          3.10 (includes lamps) |
| Lamp forward reach                                                      |        3.092125 |                           3.10 |
| Shell half width                                                        |    1.5236328125 |     1.58 (includes wheel hubs) |
| Wheel hub half width                                                    |      1.57234375 |                           1.58 |
| Complete model horizontal radius (rear bumper corner)                   |     3.945698957 |                           3.95 |
| Roof slab top (31.825 construction px)                                  |     2.884140625 |         roof tent mount height |
| Roof ribs top                                                           |     2.911328125 |      collision height + 0.0725 |
| Road-to-roof height (lowest rotated tire corner at -0.002336312 blocks) |     2.913664437 | collision height + 0.074836312 |

The roof tent generator reads both roof height and shell width from `DIMS`. Its ladder length follows the raised roof to keep the foot on the ground; the gameplay anchor and entrance follow the updated shell half width. Placement remains 3 by 3 by 3 cells and `ceil(carHeight)` remains a three-block pool, with its floor at y=-64 on the flat dev world. The 3.95-block footprint fits the existing arena starts (x=5.5, z=4.5 or greater), the pool lane (z=7.5, pool starts at z=2), and the roof tent spot (80.5, 40.5). The turn scenario checks the entire footprint against the arena floor. In-game scenarios run against BDS in CI through `.github/workflows/integration-test.yml`; no local BDS run or completed CI result is recorded here. Client checks remain outstanding.

### Placement clearance

- Applies to: SUV placement on the top face of a block.
- Rule: SUV placement clearance is `halfX` 1 and `halfZ` 1 cells, with a height of `ceil(carHeight)` cells, so the 3 by 3 by 3 cells hold the collision box. The in-game pool depth `DIVE_DEPTH=ceil(carHeight)` also stays 3. The visible body, wheels, and folded assemblies may extend outside those cells; the promise covers the collision box only.
- Agreement: Proposed
- Basis: [0213](../adr/0213-reproduce-the-reference-suv-shape.md) Notes, "Placement stays `halfX=halfZ=1` and height 3: the 3x3x3 cells still hold the collision box."; [0213](../adr/0213-reproduce-the-reference-suv-shape.md) Notes, "The visible model can extend outside those cells."
- Implementation: `src/domain/vehicle/kinds/suv/profile.ts` (`SUV_PROFILE.placement.clearance`); `src/domain/vehicle/placement/placement.ts` (`clearanceHeight`); `src/test-pack/scenarios/suv.ts` (`DIVE_DEPTH`)
- Verification: `tests/packs/placementClearance.test.ts` "fits every %s collision box inside its placement clearance"; `tests/tools/suvDimensions.test.ts` "keeps scaled SUV dimensions with the observed seat height (ADRs 0194, 0196)" (asserts the clearance). Not verified: nearby walls and doors on any client (0194 Decision).

### Seat horizontal positions

- Applies to: SUV, all four seats, ground and flight.
- Rule: Seat x is plus or minus 0.38 times `SIZE_SCALE`. Seat z (blocks, forward positive) is `(seat back z + 5.2) * SIZE_SCALE / 16`, so a rider sits 5.2 construction pixels ahead of the seat's back. The seat back z is `FRONT_SEAT_Z` for `seat_0` and `seat_1` and `REAR_SEAT_Z` for `seat_2` and `seat_3`, both in `tools/suv_dims.py`. `SUV_PROFILE.seats.positions` (x and z only) and the `seats` of `suv.se.json` agree in order and horizontal value. The seat probe in the test pack copies the SUV's `minecraft:rideable`, with cows as family types.
- Agreement: Proposed
- Basis: [0194](../adr/0194-enlarge-the-suv-for-seated-head-clearance.md) Decision, "Here x is +/-0.38 times scale, y is 0.4 times scale, and z is `(seat back z + 5.2) * scale / 16`."; [0194](../adr/0194-enlarge-the-suv-for-seated-head-clearance.md) Decision, "Retain `FRONT_SEAT_Z = -5.75` and rear seat back z=-18 in construction coordinates."; [0170](../adr/0170-measure-suv-side-view-proportions.md) Notes (Size anchor), "The front seats, `seat_0`/`seat_1` and both front riders therefore move another 1.75 generator px back, to `FRONT_SEAT_Z`=-5.75 px, keeping the 5.2 px from the seat's back to the rider"; [0117](../adr/0117-move-the-suv-front-seats-back.md) Decision, "so a front rider sits 5.2 px ahead of the seat's back, as on the rear bench"; [0117](../adr/0117-move-the-suv-front-seats-back.md) Decision, "The test pack's `yasu_ride_test:seat_probe` copies the change, as 0019 requires."
- Implementation: `tools/suv_dims.py` (`FRONT_SEAT_Z`, `REAR_SEAT_Z`); `packs/yasu_ride_bp/entities/yasu_ride/suv.se.json` (`minecraft:rideable` `seats`); `src/domain/vehicle/kinds/suv/profile.ts` (`SUV_PROFILE.seats.positions`); `packs/yasu_ride_test_bp/entities/yasu_ride_test/seat_probe.se.json`
- Verification: `tests/tools/suvDimensions.test.ts` "keeps scaled SUV dimensions with the observed seat height (ADRs 0194, 0196)" (x and z formula); `tests/packs/behaviorPack.test.ts` "seat positions and order match SUV_PROFILE.seats.positions, with the driver's seat at 0 (ADR 0019)" and "the seat probe copies the SUV's rideable, but seats cows instead of players"; `tests/tools/suvDimensions.test.ts` "keeps the steering center ahead of the front riders under the rearward cowl". Not verified: seat comfort and rider clipping into the backrest in game (0117 Consequences says to revisit if riders sink into the backrest).

### Seat height

- Applies to: SUV, all four seats, ground and flight.
- Rule: All four seats share one height, the y of each `seats` position in `suv.se.json`. The value is `SUV_BODY_SIZE.seats.y`, now 1.16 blocks: the observed 0.73-block baseline from 0196 plus the hood rise of 4.75 construction pixels times 1.45/16, rounded to 0.01 block (#1251). The seat probe uses the same y. The floor, dash, steering, model cushions, and `seat_*` bones rose with the hood; rideable seats follow by the same amount, within rounding, preserving the estimated eye relation.
- Agreement: Proposed
- Basis: [0213](../adr/0213-reproduce-the-reference-suv-shape.md) Notes, "All four rideable seats and the cow seat probe rise from 0.73 to 1.16 blocks: `round(0.73 + 4.75 * 1.45 / 16, 2)`."; [0213](../adr/0213-reproduce-the-reference-suv-shape.md) Notes, "The head-clearance and sealed-windshield tests are not relaxed."
- Implementation: `packs/yasu_ride_bp/entities/yasu_ride/suv.se.json` (`minecraft:rideable` `seats`); `packs/yasu_ride_test_bp/entities/yasu_ride_test/seat_probe.se.json`
- Verification: `tests/tools/suvDimensions.test.ts` "keeps scaled SUV dimensions with the observed seat height (ADRs 0194, 0196)"; `tests/packs/model.test.ts` "keeps every seated player's head beneath the SUV roof and behind the raked windshield with half a pixel to spare". Owner check per 0196 Context: horizon visible and head under the roof at the former 0.73-block height on the dev BDS (device and revision not recorded in the ADR). Not verified: the owner must confirm the horizon at the raised 1.16-block seats on the iPad; client comfort, touch, the seat probe and SUV boarding scenarios under the BDS lock (0196 Consequences), animated players, armor, and arbitrary skins.

### Head clearance regression guard

- Applies to: SUV, all four seats, model tests.
- Rule: The model test keeps an estimated standard-player head, grown by 0.5 px, below the roof slab and separated from the sealed glass and every part that leans with the windshield, for all four seats. The estimate uses `RIDER_HEAD_PX` and `RIDER_HEAD_HALF_PX` in `tests/packs/model.test.ts` and the 0.4-block drop of a seated player below the seat position. The checks must not be relaxed to fit higher seats. This is a geometry estimate, not a measurement of client head or eye height.
- Agreement: Proposed
- Basis: [0196](../adr/0196-raise-the-suv-seats-for-first-person-visibility.md) Decision, "The grown head must still be separated from every leaning windshield frame part and the sealed glass; do not relax those checks to accommodate the higher seats."; [0029](../adr/0029-raise-the-seats.md) Context, "Reading a seated player's location on BDS (2026-10-11) gave feet 0.3 blocks below the vehicle's origin: Bedrock lowers a player 0.4 blocks below the seat position."
- Implementation: `tests/packs/model.test.ts` (`RIDER_HEAD_PX`, `RIDER_HEAD_HALF_PX`); roof and windshield parts in `packs/yasu_ride_rp/models/entity/yasu_ride/suv.geo.json`
- Verification: `tests/packs/model.test.ts` "keeps every seated player's head beneath the SUV roof and behind the raked windshield with half a pixel to spare" (estimate-based, not an in-game check). Not verified: head clearance and first-person visibility on PC and touch beyond the single dev BDS check recorded in 0196.

### Body panels

- Applies to: SUV model and body texture, every paint.
- Rule: Each door is an outer skin over a separate inner frame, with a stepped lower rear corner, two exterior hinges on its front edge, and a pull handle on stand-off posts; all of them belong to the door bone. The hardtop is a slab at `roof_y` with two raised front panels and a raised rear section separated by seams; nothing rises more than 0.3 px above `roof_top`. Each rear quarter window is recessed in a hardtop frame. The tailgate is a panel between the tail lamps with two hinges on its right edge. Door and tailgate textures add a sheen band under the belt line and a shade band above the rocker; every paint keeps its base colour on the body swatch.
- Agreement: Proposed
- Basis: [0213](../adr/0213-reproduce-the-reference-suv-shape.md) Decision, "Build body surfaces from panels (`tools/panels.py`, 0169) where that reads as sheet metal."; [0213](../adr/0213-reproduce-the-reference-suv-shape.md) Decision, "Keep the palette and paint colours unchanged."
- Implementation: `tools/suv_doors.py`, `tools/suv_greenhouse.py`, `tools/suv_rear.py`, `tools/suv_paint_body.py`
- Verification: `tests/tools/suvBodyPanels.test.ts`; `tests/tools/suvPaintBody.test.ts`; `tests/packs/model.test.ts` "swings each door outward from the body", "keeps spinning road tires clear of flares, steps and bumpers" and the head clearance guard. Not verified: the panels and texture bands in game on any device, including the owner's iPad with Vibrant Visuals.

## Open issues

- 0170's Decision and table retain the old target values (138 px reference D and rake 34.3 degrees), while 0213 (Proposed) supersedes those targets and rake without replacing the measurement method: `docs/adr/0170-measure-suv-side-view-proportions.md`, `docs/adr/0213-reproduce-the-reference-suv-shape.md`.
- Every part row has left `PENDING`: 7/13 removed the two hood scoop rows, 8/13 the two flare rows, 9/13 `front_bumper_reach` (7.28625 model pixels, 0.333852 D), and 10/13 the two step rows after each met tolerance. All eight massing rows assigned to #1251 meet tolerance, including a 24-degree windshield with unchanged head-clearance assertions: `tools/suv_proportions.py`, `docs/adr/0213-reproduce-the-reference-suv-shape.md`.
- Round 3 of #1245 (12/13, #1257) leaves residual differences against the reference images: the front fender top stays level instead of sloping down to the front, the hood scoop reads smaller than the reference, the grille has no raised surround, the side mirrors stay body coloured and slightly small, and the comparison renders show no windshield glass. All 24 proportion rows meet tolerance: `docs/adr/0213-reproduce-the-reference-suv-shape.md`, `tools/suv_fenders.py`, `tools/suv_hood.py`, `tools/suv_doors.py`.
- The 0213 blueprints are perspective renders, with larger measurement uncertainty than 0170's reference. The fitting tolerance remains 0.05 D and 3 degrees; it is not the measurement uncertainty: `docs/adr/0213-reproduce-the-reference-suv-shape.md`.
- Accepted 0009 Decision says the collision box is 1.8 wide and 1.6 high, and the code is 2.61 wide and 2.838828125 high: `docs/adr/0009-vehicle-model-conventions.md`, `packs/yasu_ride_bp/entities/yasu_ride/suv.se.json`. Only Proposed ADRs (0170, 0194, 0213) record replacements for the numbers, so the Accepted ADR is not yet marked as superseded for them.
- Accepted 0029 Decision says all four seats are at y = 0.4 blocks, and the code is 1.16: `docs/adr/0029-raise-the-seats.md`, `packs/yasu_ride_bp/entities/yasu_ride/suv.se.json`. The chain 0170 (0.3, then 0.52), 0194 (0.58), 0196 (0.73), 0213 (1.16) is all Proposed.
- Accepted 0117 Decision says the front riders are at z = 0.2 blocks and the rear seats at z = -0.8, and the code has z derived from `FRONT_SEAT_Z` and `SIZE_SCALE` (-0.04984375 and -1.16): `docs/adr/0117-move-the-suv-front-seats-back.md`, `src/domain/vehicle/kinds/suv/profile.ts`. The superseding ADRs (0170, 0194) are Proposed.
- 0196 replaced 0194's seat height of 0.58 (0.4 times scale) with 0.73; 0213 now replaces 0.73 with 1.16 after the 4.75-pixel interior rise: `docs/adr/0194-enlarge-the-suv-for-seated-head-clearance.md`, `docs/adr/0196-raise-the-suv-seats-for-first-person-visibility.md`, `docs/adr/0213-reproduce-the-reference-suv-shape.md`. The owner must confirm the horizon at 1.16 on the iPad. The seat horizontal rule above cites that 0194 sentence for x and z only.
- 0170 Decision keeps the road wheel diameter as the size anchor, 1.8 by 1.6 box, shell reach 29.5/16, and footprint 2.35, while its Size anchor note replaces the wheel anchor with the seated player and 0194 and the 0213 6/13 note give later measured extents: `docs/adr/0170-measure-suv-side-view-proportions.md`, `docs/adr/0194-enlarge-the-suv-for-seated-head-clearance.md`, `tools/suv_proportions.py`. The Decision text was not rewritten when later notes and ADRs changed the numbers.
- 0192 Decision point 9 says merging its PR is the owner's approval of the `tail_lights` and `headlight_bezels` bones, and its Status is still Proposed while both bones exist in the model and in tests: `docs/adr/0192-suv-detailed-body.md`, `packs/yasu_ride_rp/models/entity/yasu_ride/suv.geo.json`, `tests/packs/headlights.test.ts`.
- 0194 acceptance condition asks the owner to confirm head clearance, first-person visibility, and wall and door clearance at the 1.45 scale, and 0196 records only a dev BDS check of the horizon and head under the roof at the new seat height: `docs/adr/0194-enlarge-the-suv-for-seated-head-clearance.md`, `docs/adr/0196-raise-the-suv-seats-for-first-person-visibility.md`. Whether that check satisfies 0194 is not stated.
- 0029 Decision names the test entity `mycar_test:seat_probe`, and the entity is `yasu_ride_test:seat_probe`: `docs/adr/0029-raise-the-seats.md`, `packs/yasu_ride_test_bp/entities/yasu_ride_test/seat_probe.se.json`.
