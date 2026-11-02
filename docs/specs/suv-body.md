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
- Excluded: [0167](../adr/0167-compound-rotation-assemblies-as-a-vehicle-neutral-rule.md): rotation assemblies, covered by the model-conventions topic
- Excluded: [0176](../adr/0176-move-the-sports-boat-front-seats-back.md): sports boat seat positions, not the SUV

## Rules

### Model orientation and bone contract

- Applies to: SUV model (`geometry.yasu_ride.suv`), all modes.
- Rule: The front of the SUV is the model's -z side. The model has the bones `root`, `body`, `wheel_fl`, `wheel_fr`, `wheel_rl`, `wheel_rr`, `door_fl`, `door_fr`, `door_rl`, `door_rr`, and `seat_0` to `seat_3`. Each wheel bone pivots at the center of its axle and each door bone at its hinge (front edge). The locator `exhaust` marks the exhaust position on `body`. Each `seat_i` and `door_i` bone sits on the same side (sign of x) as the rider `i` in `SUV_PROFILE.seats.positions`.
- Agreement: Accepted
- Basis: [0009](../adr/0009-vehicle-model-conventions.md) Decision, "The front of the entity is the model's -z side"; [0009](../adr/0009-vehicle-model-conventions.md) Decision, "Standardize the bone names as follows: `root`, `body`, `wheel_fl` / `wheel_fr` / `wheel_rl` / `wheel_rr`, `door_fl` / `door_fr` / `door_rl` / `door_rr`, `seat_0`–`seat_3`"; [0009](../adr/0009-vehicle-model-conventions.md) Decision, "Put each wheel bone's pivot at the center of its axle and each door bone's pivot at its hinge (front edge)"
- Implementation: `packs/yasu_ride_rp/models/entity/yasu_ride/suv.geo.json`; `tools/gen_model.py`
- Verification: `tests/packs/model.test.ts` "has all the conventional bones", "faces -z: front wheels, front doors and front seats sit at lower z than the rear ones", "puts each seat, its door and the same-side wheels on the side SUV_PROFILE.seats.positions names", "has the exhaust locator on body". Not verified: wheel and door pivot positions against the stated pivots (no test reads them), the model in game on any device.

### Lamp bones beyond the 0009 list

- Applies to: SUV model, lit lamp parts.
- Rule: The model also has the bones `headlights`, `tail_lights`, and `headlight_bezels`. Lamp cubes belong to a bone by the part that builds them, not by colour: `headlights` holds the headlight lenses, fog lamp lenses, and the front lamp strip; `tail_lights` holds the lit tail lamp parts and the third brake light; `headlight_bezels` holds the cutout bezel panels and stays in the base pass, so it is not an overlay bone.
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
- Rule: Construction coordinates stay unscaled. `SIZE_SCALE` in `tools/suv_dims.py` is the one uniform scale that export applies to every length, pivot, locator, and animation translation. Textures, UVs, palette, paint colours, and bone names do not change with it. Its value is 1.45, which `tests/tools/suvDimensions.test.ts` asserts. The camper and the bulldozer keep their own geometry and collision boxes.
- Agreement: Proposed
- Basis: [0194](../adr/0194-enlarge-the-suv-for-seated-head-clearance.md) Decision, "Continue applying this one uniform transform at export to every length, pivot, locator and animation translation."; [0194](../adr/0194-enlarge-the-suv-for-seated-head-clearance.md) Decision, "Use `SIZE_SCALE = 1.45` in `tools/suv_dims.py`, an increase of 1.45/1.30, approximately 11.54 percent."
- Implementation: `tools/suv_dims.py` (`SIZE_SCALE`); `tools/suv_export.py`
- Verification: `tests/tools/suvDimensions.test.ts` "keeps scaled SUV dimensions with the observed seat height (ADRs 0194, 0196)" (asserts `SIZE_SCALE`). Not verified: that the 1.45 scale is acceptable on PC or touch (0194 calls it "a first guess, not an accepted client measurement").

### Side-view proportion targets

- Applies to: SUV model, closed doors, unanimated pose.
- Rule: The generated model is measured by `tools/suv_proportions.py` against the thirteen rows of `TARGETS` (twelve linear ratios to the road wheel diameter and the windshield rake in degrees). `PENDING` is empty, so every row is asserted within its tolerance. A change to the body outline must keep every row within tolerance and the completed ratios within 0.005 of their recorded values.
- Agreement: Proposed
- Basis: [0170](../adr/0170-measure-suv-side-view-proportions.md) Decision, "Keep every table row in `TARGETS` with its tolerance."; [0194](../adr/0194-enlarge-the-suv-for-seated-head-clearance.md) Decision, "Keep the thirteen proportion targets, completed ratios and tolerances from 0170."
- Implementation: `tools/suv_proportions.py` (`TARGETS`, `PENDING`, `measure`)
- Verification: `tests/tools/suvProportions.test.ts` "preserves every completed 7/7 proportion within 0.005", "<key> meets the reference tolerance" for each row, "measures every row positively and deterministically without mutating cubes". These are geometry measurements of the exported model. Not verified: the silhouette in game on PC and touch (0170 Consequences makes that the acceptance condition).

### Collision box and values derived from it

- Applies to: SUV, all modes.
- Rule: The collision box is a square seen from above, so the front and back of the body stick out of it. Its width is 1.8 times `SIZE_SCALE` and its height is 1.6 times `SIZE_SCALE` (2.61 wide and 2.32 high, which `tests/packs/behaviorPack.test.ts` asserts). `SUV_SPEC.carHeight` equals the box height, `SUV_SPEC.hitboxFront` equals half the box width, `SUV_SPEC.floatDraft` is 0.75 of the box height, and `SUV_SPEC.gearProbeOffset` is `hitboxFront * (1 - 0.1/0.9)`.
- Agreement: Proposed
- Basis: [0009](../adr/0009-vehicle-model-conventions.md) Decision, "Make the collision box a 1.8-wide, 1.6-high square, and accept that the front and back of the body stick out and appear to sink into walls"; [0194](../adr/0194-enlarge-the-suv-for-seated-head-clearance.md) Decision, "The square engine collision box remains proportional to the original 1.8-wide, 1.6-high envelope: width=1.8*1.45=2.61 and height=1.6*1.45=2.32."; [0194](../adr/0194-enlarge-the-suv-for-seated-head-clearance.md) Decision, "Set `carHeight=2.32`, `hitboxFront=2.61/2=1.305`, `floatDraft=2.32*0.75=1.74` and `gearProbeOffset=1.305*(1-0.1/0.9)=1.16`."
- Implementation: `packs/yasu_ride_bp/entities/yasu_ride/suv.se.json` (`minecraft:collision_box`); `src/domain/vehicle/kinds/suv/spec.ts` (`SUV_SPEC`)
- Verification: `tests/packs/behaviorPack.test.ts` "scales the square collision envelope with the SUV (ADR 0170)"; `tests/tools/suvDimensions.test.ts` "keeps scaled SUV dimensions with the observed seat height (ADRs 0194, 0196)". Not verified: wall overlap and door clearance on any client (0194 Consequences).

### Enclosing probes and roof margin

- Applies to: SUV, ram and body probes, vehicle footprint.
- Rule: `SUV_SPEC.bodyFront` and `SUV_SPEC.bodyHalfWidth` enclose the exported shell (`body` plus closed `door_*` bones), the lamp reach (`headlights` bone), and the wheel hub half width. `SUV_SPEC.footprint` encloses the farthest horizontal corner of every bone. Each is rounded up from the measured extent, which is taken from all eight rotated corners of every cube. The visible roof, including ribs, stays within 0.30 blocks above `SUV_SPEC.carHeight`, and that margin must not grow. A change to the body outline re-derives these values and reviews the collision box, seats, and placement clearance.
- Agreement: Proposed
- Basis: [0194](../adr/0194-enlarge-the-suv-for-seated-head-clearance.md) Decision, "Round enclosing probes upward to `bodyFront=2.69`, `bodyHalfWidth=1.64` and `footprint=3.40`."; [0194](../adr/0194-enlarge-the-suv-for-seated-head-clearance.md) Decision, "The visible roof remains within the unchanged maximum 0.30-block allowance above `carHeight`."; [0170](../adr/0170-measure-suv-side-view-proportions.md) Decision, "Each PR changing the body outline re-derives `SUV_SPEC.bodyFront`, `bodyHalfWidth`, `footprint` and `carHeight`, documents the measured extents, and reviews collision box, seats and placement clearance."; [0170](../adr/0170-measure-suv-side-view-proportions.md) Decision, "Do not silently increase that margin in subsequent PRs."
- Implementation: `src/domain/vehicle/kinds/suv/spec.ts` (`SUV_SPEC.bodyFront`, `bodyHalfWidth`, `footprint`, `carHeight`); `tools/suv_proportions.py`
- Verification: `tests/tools/suvProportions.test.ts` "keeps the body shell inside game probes and the complete model inside its footprint" (pins shell reach, shell half width, and roof-to-road height); `tests/packs/model.test.ts` "keeps every hover glow round and inside the vehicle footprint". Not verified: the probes against the engine in game.

### Placement clearance

- Applies to: SUV placement on the top face of a block.
- Rule: SUV placement clearance is `halfX` 1 and `halfZ` 1 cells, with a height of `ceil(carHeight)` cells, so the 3 by 3 by 3 cells hold the collision box. The visible body, wheels, and folded assemblies may extend outside those cells; the promise covers the collision box only.
- Agreement: Proposed
- Basis: [0194](../adr/0194-enlarge-the-suv-for-seated-head-clearance.md) Decision, "Keep SUV placement `halfX=halfZ=1`: collision half width 1.305 remains below the 1.5-block cell boundary and the placement guard passes."; [0194](../adr/0194-enlarge-the-suv-for-seated-head-clearance.md) Decision, "Vertical clearance stays `ceil(carHeight)=3`."
- Implementation: `src/domain/vehicle/kinds/suv/profile.ts` (`SUV_PROFILE.placement.clearance`); `src/domain/vehicle/placement/placement.ts` (`clearanceHeight`)
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
- Rule: All four seats share one height, the y of each `seats` position in `suv.se.json`. The value is 0.73 blocks, an observed value the owner tried on the dev BDS and not a derived one; `tests/tools/suvDimensions.test.ts` and `tests/packs/model.test.ts` assert it. The seat probe uses the same y. Seat cushions and `seat_*` bones do not follow the height.
- Agreement: Proposed
- Basis: [0196](../adr/0196-raise-the-suv-seats-for-first-person-visibility.md) Decision, "Raise all four SUV rideable seats by 0.15 block, from y=0.58 to y=0.73, and match the cow seat probe (0019)."; [0196](../adr/0196-raise-the-suv-seats-for-first-person-visibility.md) Context, "The new seat height is an observed value, not a value derived from that estimate."
- Implementation: `packs/yasu_ride_bp/entities/yasu_ride/suv.se.json` (`minecraft:rideable` `seats`); `packs/yasu_ride_test_bp/entities/yasu_ride_test/seat_probe.se.json`
- Verification: `tests/tools/suvDimensions.test.ts` "keeps scaled SUV dimensions with the observed seat height (ADRs 0194, 0196)"; `tests/packs/model.test.ts` "keeps every seated player's head beneath the SUV roof and behind the raked windshield with half a pixel to spare". Owner check per 0196 Context: horizon visible and head under the roof at this height on the dev BDS (device and revision not recorded in the ADR). Not verified: touch, the seat probe and SUV boarding scenarios under the BDS lock (0196 Consequences), animated players, armor, and arbitrary skins.

### Head clearance regression guard

- Applies to: SUV, all four seats, model tests.
- Rule: The model test keeps an estimated standard-player head, grown by 0.5 px, below the roof slab and separated from the sealed glass and every part that leans with the windshield, for all four seats. The estimate uses `RIDER_HEAD_PX` and `RIDER_HEAD_HALF_PX` in `tests/packs/model.test.ts` and the 0.4-block drop of a seated player below the seat position. The checks must not be relaxed to fit higher seats. This is a geometry estimate, not a measurement of client head or eye height.
- Agreement: Proposed
- Basis: [0196](../adr/0196-raise-the-suv-seats-for-first-person-visibility.md) Decision, "The grown head must still be separated from every leaning windshield frame part and the sealed glass; do not relax those checks to accommodate the higher seats."; [0029](../adr/0029-raise-the-seats.md) Context, "Reading a seated player's location on BDS (2026-10-11) gave feet 0.3 blocks below the vehicle's origin: Bedrock lowers a player 0.4 blocks below the seat position."
- Implementation: `tests/packs/model.test.ts` (`RIDER_HEAD_PX`, `RIDER_HEAD_HALF_PX`); roof and windshield parts in `packs/yasu_ride_rp/models/entity/yasu_ride/suv.geo.json`
- Verification: `tests/packs/model.test.ts` "keeps every seated player's head beneath the SUV roof and behind the raked windshield with half a pixel to spare" (estimate-based, not an in-game check). Not verified: head clearance and first-person visibility on PC and touch beyond the single dev BDS check recorded in 0196.

## Open issues

- Accepted 0009 Decision says the collision box is 1.8 wide and 1.6 high, and the code is 2.61 wide and 2.32 high: `docs/adr/0009-vehicle-model-conventions.md`, `packs/yasu_ride_bp/entities/yasu_ride/suv.se.json`. Only Proposed ADRs (0170, 0194) supersede the numbers, so the Accepted ADR is not yet marked as superseded for them.
- Accepted 0029 Decision says all four seats are at y = 0.4 blocks, and the code is 0.73: `docs/adr/0029-raise-the-seats.md`, `packs/yasu_ride_bp/entities/yasu_ride/suv.se.json`. The chain 0170 (0.3, then 0.52), 0194 (0.58), 0196 (0.73) is all Proposed.
- Accepted 0117 Decision says the front riders are at z = 0.2 blocks and the rear seats at z = -0.8, and the code has z derived from `FRONT_SEAT_Z` and `SIZE_SCALE` (-0.04984375 and -1.16): `docs/adr/0117-move-the-suv-front-seats-back.md`, `src/domain/vehicle/kinds/suv/profile.ts`. The superseding ADRs (0170, 0194) are Proposed.
- 0196 replaced 0194's seat height of 0.58 (0.4 times scale) with 0.73: `docs/adr/0194-enlarge-the-suv-for-seated-head-clearance.md`, `docs/adr/0196-raise-the-suv-seats-for-first-person-visibility.md`. The seat horizontal rule above cites that 0194 sentence for x and z only.
- 0170 Decision keeps the road wheel diameter as the size anchor, 1.8 by 1.6 box, shell reach 29.5/16, and footprint 2.35, while its Size anchor note replaces the wheel anchor with the seated player and 0194 gives different measured extents: `docs/adr/0170-measure-suv-side-view-proportions.md`, `docs/adr/0194-enlarge-the-suv-for-seated-head-clearance.md`, `tools/suv_proportions.py`. The Decision text was not rewritten when later notes and ADRs changed the numbers.
- 0192 Decision point 9 says merging its PR is the owner's approval of the `tail_lights` and `headlight_bezels` bones, and its Status is still Proposed while both bones exist in the model and in tests: `docs/adr/0192-suv-detailed-body.md`, `packs/yasu_ride_rp/models/entity/yasu_ride/suv.geo.json`, `tests/packs/headlights.test.ts`.
- 0194 acceptance condition asks the owner to confirm head clearance, first-person visibility, and wall and door clearance at the 1.45 scale, and 0196 records only a dev BDS check of the horizon and head under the roof at the new seat height: `docs/adr/0194-enlarge-the-suv-for-seated-head-clearance.md`, `docs/adr/0196-raise-the-suv-seats-for-first-person-visibility.md`. Whether that check satisfies 0194 is not stated.
- 0029 Decision names the test entity `mycar_test:seat_probe`, and the entity is `yasu_ride_test:seat_probe`: `docs/adr/0029-raise-the-seats.md`, `packs/yasu_ride_test_bp/entities/yasu_ride_test/seat_probe.se.json`.
