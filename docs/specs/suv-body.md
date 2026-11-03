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
- Source: [0214](../adr/0214-replace-the-suv-with-the-rubicon-shape.md)
- Source: [0215](../adr/0215-fit-the-suv-interior-to-the-rubicon-cabin.md)
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
- Rule: The model also has the bones `headlights`, `tail_lights`, and `headlight_bezels`. Lamp cubes belong to a bone by the part that builds them, not by colour: `headlights` holds the headlight lenses, the fog lamp lenses, and the front marker lens; `tail_lights` holds the lit tail lamp faces and the third brake light; `headlight_bezels` holds the cutout bezel panels and stays in the base pass, so it is not an overlay bone.
- Agreement: Proposed
- Basis: [0192](../adr/0192-suv-detailed-body.md) Decision, "Extend 0009 with `tail_lights` for the lit tail lamp parts and the third brake light, and `headlight_bezels` for the cutout panels."; [0192](../adr/0192-suv-detailed-body.md) Decision, "Assign lamp cubes to bones by the part that builds them, not by colour."; [0192](../adr/0192-suv-detailed-body.md) Decision, "`headlights` keeps the headlight lenses, fog lamp lenses and front lamp strip on the fender flares"; [0192](../adr/0192-suv-detailed-body.md) Decision, "`headlight_bezels` stays in the base pass and is not an overlay bone."
- Implementation: `packs/yasu_ride_rp/models/entity/yasu_ride/suv.geo.json`; `tools/suv_lamps.py`; `tools/suv_front.py`
- Verification: `tests/packs/headlights.test.ts` "places both detailed tail faces and the third brake light on the tail bone", "places every light swatch cube on the headlights bone", "keeps two cutout bezels on an origin-pivoted body child in the base pass". Not verified: lamp appearance in game (0192 Decision point 7 and the headlight material result of part 13 are recorded as pending the owner's in-game comparison).

### Grille and marks

- Applies to: SUV model, front grille.
- Rule: The grille has eight slots and carries no logo or vehicle name (a seven-slot grille is a Jeep trademark).
- Agreement: Accepted
- Basis: [0009](../adr/0009-vehicle-model-conventions.md) Decision, "Give the grille eight slots, with no logo or vehicle name."
- Implementation: `tools/suv_front.py` (`grille`, `GRILLE_SLOTS`)
- Verification: Not verified: no test counts the grille slots or checks for marks on the model; the slot count is checked by reading the generator only.

### Rubicon body, size anchor and wheels

- Applies to: SUV model (`geometry.yasu_ride.suv`), all modes.
- Rule: The SUV exterior is the Rubicon shape, written in tyre diameters D with D = 12.645 construction pixels (26.1 divided by 2.064, so the roof ribs stay 26.1 px high at `SIZE_SCALE` 1.45). The front axle is at construction z 17.2, and every other length in `tools/suv_dims.py` follows from D. The half width is 0.885 D behind the windshield base and widens as a trapezoid over the hood. Every wheel, the spare included, is the 133-cube road wheel scaled by D / 12 across and 0.43 D along its axle. The spare's front face stands 3.585 D from the front axle, clear of the tailgate, the rear window and the rear bumper. Open window frames, door openings, the eight-slot grille and the bone contract are above; the side windows, windshield and rear window are filled by `windows_sealed` and `rear_glass` in flight and under water.
- Agreement: Accepted
- Basis: [0214](../adr/0214-replace-the-suv-with-the-rubicon-shape.md) Decision, "That makes D = 26.1 / 2.064 = 12.645 px, 1.146 blocks at `SIZE_SCALE` 1.45, which does not change."; [0214](../adr/0214-replace-the-suv-with-the-rubicon-shape.md) Decision, "Every wheel, the spare included, is the 133-cube construction of the earlier SUV, drawn at radius 6 and half tread 2, then scaled by D / 12 across and by 0.43 D / 4 along the axle."; [0214](../adr/0214-replace-the-suv-with-the-rubicon-shape.md) Decision, "The spare sits at z 3.80 D, y 1.35 D (front face 3.585 D, bottom 0.85 D), so it clears all three."
- Implementation: `tools/suv_dims.py`; `tools/suv_kit.py`; `tools/suv_hull.py`; `tools/suv_front.py`; `tools/suv_cab.py`; `tools/suv_rear.py`; `tools/suv_body.py`; `tools/suv_running_gear.py`; `tools/gen_model.py`
- Verification: `tests/packs/model.test.ts` "keeps spinning road tires clear of flares, steps and bumpers", "has one windshield plate, leaning with the windshield frame", "fills each side window from sill to top rail", "keeps the spare wheel clear of every other body cube and of the rear glass"; `tests/tools/suvDimensions.test.ts` "joins the leaning A-pillars to the roof without protruding above it". Not verified: the model against the 19 photos by the repository's preview renderer at each photo angle, the look in game.

### Single size scale

- Applies to: SUV model export, all modes.
- Rule: Construction coordinates stay unscaled. `SIZE_SCALE` in `tools/suv_dims.py` is the one uniform scale that export applies to every length, pivot, locator, and animation translation. Textures, UVs, palette, paint colours, and bone names do not change with it. Its value is 1.45, which `tests/tools/suvDimensions.test.ts` asserts, and the tyre diameter D that sizes the Rubicon body is derived from the roof height (below). The camper and the bulldozer keep their own geometry and collision boxes.
- Agreement: Proposed
- Basis: [0194](../adr/0194-enlarge-the-suv-for-seated-head-clearance.md) Decision, "Continue applying this one uniform transform at export to every length, pivot, locator and animation translation."; [0194](../adr/0194-enlarge-the-suv-for-seated-head-clearance.md) Decision, "Use `SIZE_SCALE = 1.45` in `tools/suv_dims.py`, an increase of 1.45/1.30, approximately 11.54 percent."
- Implementation: `tools/suv_dims.py` (`SIZE_SCALE`); `tools/suv_export.py`
- Verification: `tests/tools/suvDimensions.test.ts` "keeps scaled SUV dimensions with cabin-derived seat positions (ADR 0215)" (asserts `SIZE_SCALE`), "keeps the SUV spec values that mirror the model above the generator constants" (checks `SUV_SPEC` `bodyFront`, `bodyHalfWidth`, `footprint`, `carHeight` and `roofTentRoofHeight` against `tools/suv_dims.py` constants). Not verified: that the 1.45 scale is acceptable on PC or touch (0194 calls it "a first guess, not an accepted client measurement").

### Side-view proportion targets

- Applies to: SUV model, closed doors, unanimated pose.
- Rule: The generated model is measured by `tools/suv_proportions.py` against the thirteen rows of `TARGETS` (twelve linear ratios to the road wheel diameter and the windshield rake in degrees): wheelbase 3.007, front overhang 0.974, rear overhang 0.826, ground clearance 0.679, overall height 2.064, belt 1.495, side window 0.460, hood 1.461, hood length 1.748, front bumper 0.287, rear bumper 0.340, bumper height 0.357, rake 35.78 degrees. `PENDING` is empty, so every row is asserted within its tolerance (0.05, and 3 degrees for the rake). A change to the body outline must keep every row within tolerance and the recorded ratios within 0.005.
- Agreement: Accepted
- Basis: [0214](../adr/0214-replace-the-suv-with-the-rubicon-shape.md) Decision, "The thirteen rows are re-recorded from the model: wheelbase 3.007 D, front overhang 0.974, rear overhang 0.826, ground clearance 0.679, overall height 2.064, belt 1.495, side window 0.460, hood 1.461, hood length 1.748, front bumper 0.287, rear bumper 0.340, bumper height 0.357, rake 35.78 degrees."
- Implementation: `tools/suv_proportions.py` (`TARGETS`, `PENDING`, `measure`)
- Verification: `tests/tools/suvProportions.test.ts` "preserves every recorded Rubicon proportion within 0.005 (ADR 0214)", "<key> meets the reference tolerance" for each row, "measures every row positively and deterministically without mutating cubes". These are geometry measurements of the exported model. Not verified: the silhouette in game on PC and touch, and the rows against the 19 owner photos beyond the spike's recorded estimates (wheelbase 2.95 to 3.10, roof 2.00 to 2.10, hood 1.43 to 1.50, rake 34 to 38 degrees).

### Collision box and values derived from it

- Applies to: SUV, all modes.
- Rule: The collision box is a square seen from above, so the front and back of the body stick out of it. Its width is 1.8 times `SIZE_SCALE` and its height is 1.6 times `SIZE_SCALE` (2.61 wide and 2.32 high, which `tests/packs/behaviorPack.test.ts` asserts). `SUV_SPEC.carHeight` equals the box height, `SUV_SPEC.hitboxFront` equals half the box width, `SUV_SPEC.floatDraft` is 0.75 of the box height, and `SUV_SPEC.gearProbeOffset` is `hitboxFront * (1 - 0.1/0.9)`.
- Agreement: Proposed
- Basis: [0009](../adr/0009-vehicle-model-conventions.md) Decision, "Make the collision box a 1.8-wide, 1.6-high square, and accept that the front and back of the body stick out and appear to sink into walls"; [0194](../adr/0194-enlarge-the-suv-for-seated-head-clearance.md) Decision, "The square engine collision box remains proportional to the original 1.8-wide, 1.6-high envelope: width=1.8*1.45=2.61 and height=1.6*1.45=2.32."; [0194](../adr/0194-enlarge-the-suv-for-seated-head-clearance.md) Decision, "Set `carHeight=2.32`, `hitboxFront=2.61/2=1.305`, `floatDraft=2.32*0.75=1.74` and `gearProbeOffset=1.305*(1-0.1/0.9)=1.16`."
- Implementation: `packs/yasu_ride_bp/entities/yasu_ride/suv.se.json` (`minecraft:collision_box`); `src/domain/vehicle/kinds/suv/spec.ts` (`SUV_SPEC`)
- Verification: `tests/packs/behaviorPack.test.ts` "scales the square collision envelope with the SUV (ADR 0170)"; `tests/tools/suvDimensions.test.ts` "keeps scaled SUV dimensions with cabin-derived seat positions (ADR 0215)". Not verified: wall overlap and door clearance on any client (0194 Consequences).

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
- Verification: `tests/packs/placementClearance.test.ts` "fits every %s collision box inside its placement clearance"; `tests/tools/suvDimensions.test.ts` "keeps scaled SUV dimensions with cabin-derived seat positions (ADR 0215)" (asserts the clearance). Not verified: nearby walls and doors on any client (0194 Decision).

### Seat horizontal positions

- Applies to: SUV, all four seats, ground and flight.
- Rule: Rider construction x is half the door inner half width (5.113829 px). The front rider z is the farthest forward value whose grown head clears the windshield inner plane by another 0.5 exported px; the rear rider z is the farthest back value whose torso clears the rear arch front edge by 0.5 exported px. Round z toward the cabin interior to 0.001 block and x to three decimals. Entity x/z are (-0.463, -0.089), (+0.463, -0.089), (-0.463, -0.974), (+0.463, -0.974), in driver/front passenger/behind driver/behind passenger order. Each seat back stays 5.2 construction px behind its rider. Rideable, profile and cow seat probe agree.
- Agreement: Proposed
- Basis: [0215](../adr/0215-fit-the-suv-interior-to-the-rubicon-cabin.md) Decision, "Centre each rider in their half of the usable cabin"; "Put the front rider as far forward as the grown head permits"; "Put the rear rider as far back as the rear arch permits"; "Keep every rider 5.2 construction pixels ahead of the seat back."
- Implementation: `tools/suv_dims.py`; `tools/gen_model.py`; `packs/yasu_ride_bp/entities/yasu_ride/suv.se.json`; `src/domain/vehicle/kinds/suv/profile.ts`; `packs/yasu_ride_test_bp/entities/yasu_ride_test/seat_probe.se.json`
- Verification: `tests/tools/suvDimensions.test.ts` "keeps scaled SUV dimensions with cabin-derived seat positions (ADR 0215)"; `tests/packs/behaviorPack.test.ts` "seat positions and order match SUV_PROFILE.seats.positions, with the driver's seat at 0 (ADR 0019)" and "the seat probe copies the SUV's rideable, but seats cows instead of players"; `tests/packs/model.test.ts` "keeps every seated torso clear of the body and doors except seat upholstery". Not verified: rider poses and legroom in game.

### Seat height

- Applies to: SUV, all four seats, ground and flight.
- Rule: Derive SEAT_Y from the roof underside minus 1 exported px clearance and the standard head top above the seat (30.46875 - 6.4 entity px), rounded down to 0.01 block: 0.74 blocks. Cushions start at FLOOR_Y (10.116279 construction px), top out at 10.517241, and backrests at 18.768966. Seat bone pivots follow rider x and cushion top with the existing z relationship to their backs. Rear straight legs cross the front backrests; thigh undersides clear the high floor by only 0.100962 construction px.
- Agreement: Proposed
- Basis: [0215](../adr/0215-fit-the-suv-interior-to-the-rubicon-cabin.md) Decision, "Set seat y by rounding downward to 0.01 block after reserving 1 exported pixel beneath the roof"; "Put cushion bottoms on FLOOR_Y."
- Implementation: `tools/suv_dims.py`; `tools/suv_cabin.py`; `tools/gen_model.py`; SUV and seat probe rideable components
- Verification: `tests/tools/suvDimensions.test.ts` "keeps scaled SUV dimensions with cabin-derived seat positions (ADR 0215)"; `tests/packs/model.test.ts` "keeps every seated player's head beneath the SUV roof and behind the raked windshield with half a pixel to spare". Not verified: animated players, armor, arbitrary skins and comfort on PC and touch clients.

### Head clearance regression guard

- Applies to: SUV, all four seats, model tests.
- Rule: Preserve the standard-player head box grown by 0.5 entity px against the roof slab, sealed glass and every leaning windshield frame part, without relaxing the checks. The estimate uses head top (24 + 8 + 0.5) * 0.9375 and half reach (4 + 0.5) * 0.9375, with the 0.4-block rider drop. Seat height comes from SEAT_Y; the physical head top clears the roof by 1.092805 entity px. This is a geometry estimate.
- Agreement: Proposed
- Basis: [0215](../adr/0215-fit-the-suv-interior-to-the-rubicon-cabin.md) Decision, "Preserve the existing half-pixel grown-head checks against the roof slab, sealed glass and every leaning windshield frame part without weakening them."; [0029](../adr/0029-raise-the-seats.md) Context, "Bedrock lowers a player 0.4 blocks below the seat position."
- Implementation: `tests/packs/model.test.ts` (`RIDER_HEAD_PX`, `RIDER_HEAD_HALF_PX`); `tools/suv_dims.py`
- Verification: `tests/packs/model.test.ts` "keeps every seated player's head beneath the SUV roof and behind the raked windshield with half a pixel to spare". Not verified: client head clearance beyond this standard-player geometry estimate.

### Eye height and windshield view

- Applies to: SUV, all four seats, ground and flight.
- Rule: Eye y is (SEAT_Y - 0.4 + 1.62) * 16 = 31.36 entity px (1.96 blocks, 21.627586 construction px). It stays at least 5 entity px below the roof underside (measured 5.641555), strictly between the turned windshield glass edges (27.213874 and 36.955359 entity px), and above the hood and every dashboard/gauge cube ahead of the riders. Refit the dash to the door inner faces, map passenger fittings into that width, centre wheel/gauges/pedals on the driver, lift pedals above the floor, and replace the solid belt slab with side and tail strips to clear rider torsos.
- Agreement: Proposed
- Basis: [0215](../adr/0215-fit-the-suv-interior-to-the-rubicon-cabin.md) Decision, "Require at least 5 entity pixels below the roof underside and strictly between the turned windshield glass's lower and upper edges"; "Make the belt shell hollow."; "Refit interior x to the cabin."
- Implementation: `tools/suv_dims.py`; `tools/suv_cab.py`; `tools/suv_dash.py`; `tools/suv_gauges.py`; `tools/suv_cabin.py`
- Verification: `tests/packs/model.test.ts` "keeps every rider's eye at least 5 entity pixels below the roof with an unobstructed windshield horizon" and "keeps every seated torso clear of the body and doors except seat upholstery". Not verified: first-person camera and visibility on PC and touch clients.

## Open issues

- Accepted 0009 Decision says the collision box is 1.8 wide and 1.6 high, and the code is 2.61 wide and 2.32 high: `docs/adr/0009-vehicle-model-conventions.md`, `packs/yasu_ride_bp/entities/yasu_ride/suv.se.json`. Only Proposed ADRs (0170, 0194) supersede the numbers, so the Accepted ADR is not yet marked as superseded for them.
- Accepted 0029 Decision says all four seats are at y = 0.4 blocks, and the code is 0.74: `docs/adr/0029-raise-the-seats.md`, `packs/yasu_ride_bp/entities/yasu_ride/suv.se.json`. The chain 0170 (0.3, then 0.52), 0194 (0.58), 0196 (0.73), 0215 (0.74) is all Proposed.
- Accepted 0117 Decision says the front riders are at z = 0.2 blocks and the rear seats at z = -0.8, and the code has z derived from the new cabin constraints in 0215 (-0.089 and -0.974): `docs/adr/0117-move-the-suv-front-seats-back.md`, `src/domain/vehicle/kinds/suv/profile.ts`. The superseding ADRs (0170, 0194, 0215) are Proposed.
- 0215 replaces 0196's observed seat y 0.73 with roof-derived 0.74 and 0194's horizontal values with x +/-0.463, front z -0.089 and rear z -0.974: `docs/adr/0215-fit-the-suv-interior-to-the-rubicon-cabin.md`. These remain Proposed and need client checks.
- 0170 Decision keeps the road wheel diameter as the size anchor, 1.8 by 1.6 box, shell reach 29.5/16, and footprint 2.35, while its Size anchor note replaces the wheel anchor with the seated player and 0194 gives different measured extents: `docs/adr/0170-measure-suv-side-view-proportions.md`, `docs/adr/0194-enlarge-the-suv-for-seated-head-clearance.md`, `tools/suv_proportions.py`. The Decision text was not rewritten when later notes and ADRs changed the numbers.
- 0192 Decision point 9 says merging its PR is the owner's approval of the `tail_lights` and `headlight_bezels` bones, and its Status is still Proposed while both bones exist in the model and in tests: `docs/adr/0192-suv-detailed-body.md`, `packs/yasu_ride_rp/models/entity/yasu_ride/suv.geo.json`, `tests/packs/headlights.test.ts`.
- 0194 acceptance condition asks the owner to confirm head clearance, first-person visibility, and wall and door clearance at the 1.45 scale, and 0196 records only a dev BDS check of the horizon and head under the roof at the new seat height: `docs/adr/0194-enlarge-the-suv-for-seated-head-clearance.md`, `docs/adr/0196-raise-the-suv-seats-for-first-person-visibility.md`. Whether that check satisfies 0194 is not stated.
- 0029 Decision names the test entity `mycar_test:seat_probe`, and the entity is `yasu_ride_test:seat_probe`: `docs/adr/0029-raise-the-seats.md`, `packs/yasu_ride_test_bp/entities/yasu_ride_test/seat_probe.se.json`.
- 0214 leaves `SUV_SPEC`, the collision box and the roof tent anchors for the next pull request, so those values describe the old body while the model is the Rubicon shape; 0215 now derives and refits the seats and interior: `docs/adr/0214-replace-the-suv-with-the-rubicon-shape.md`, `src/domain/vehicle/kinds/suv/spec.ts`. The new model's measured extents are 2.680 blocks ahead of and 3.104 behind its centre, 1.337 half width for the shell and 1.425 for the wheels, 2.376 high, and 3.114 for the footprint corner. The existing probes (bodyFront 2.69, bodyHalfWidth 1.64, footprint 3.40, carHeight 2.32) enclose them.
- 0215 refits the interior left for later by 0214, including the hollow belt shell, dashboard, gauges, seats, steering and pedals. Rear straight legs still cross the front backrests by their full 1.8 construction px depth and thighs clear the floor by only 0.100962 construction px; these compromises need PC and touch inspection: `docs/adr/0215-fit-the-suv-interior-to-the-rubicon-cabin.md`.
- 0192's painted steel body regions (`body` atlas block) are removed, so the 0192 rules about panel lines, flake and `PBR` body regions no longer have an implementation; the relief maps stay but are flat: `tools/suv_atlas.py`, `tools/suv_material.py`.
