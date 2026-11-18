# 0251. Add the scooter kind

- Status: Proposed
- Acceptance condition: the manual Scooter checks in manual-test.md pass on PC and mobile (#1766)
- Date: 2026-11-16
- Extends: [0009](0009-vehicle-model-conventions.md): the front direction and bone names
- Extends: [0040](0040-submarine.md): the surface water policy
- Extends: [0050](0050-vehicle-kinds-and-per-kind-profiles.md): per-kind profiles and tuning
- Extends: [0055](0055-kind-neutral-vehicle-core.md): a fifth kind on the kind-neutral core
- Extends: [0167](0167-compound-rotation-assemblies-as-a-vehicle-neutral-rule.md): named assemblies for curved panels
- Extends: [0250](0250-scooter-rider-grip-pose-and-stepped-lean.md): the riders' pose and lean wiring

## Context

The owner wanted a classic 1960s-style two-seat scooter to ride with a friend. Its shape was agreed in a throwaway spike judged against reference photos over fifteen review rounds. The spike has 8,338 boxes, far more than the SUV (2,109) or the bulldozer (3,746), so the production model is a rebuild with per-area allocations in `tools/scooter_dims.py` and a 6,000-cube ceiling.

Nothing in the four existing kinds covers what the scooter needs: a narrow body that leans and steers, a stand that holds it upright when it is empty, wheels that lie flat to fly, and running on the water surface without ever diving. The SUV and camper submerge as soon as the water reaches their height, and their step-up probe lanes are wider than the scooter.

## Decision

Add the kind `scooter`: entity `yasu_ride:scooter`, item `yasu_ride:scooter_item`, one driver in seat 0 and one passenger in seat 1 behind the driver, fleet limit 10 per player, default paint white, all 16 dyes.

**Model.** Generate it with `tools/gen_scooter.py` and the area modules `scooter_body`, `scooter_floor`, `scooter_shield`, `scooter_head`, `scooter_running`, `scooter_stand`, `scooter_struts`, `scooter_engine` and `scooter_rear`, on one dimension module (`scooter_dims.py`), kit and atlas. The scale is 1.25 times real size (wheelbase 23.6 px, tyre radius 4.3 px). The bone layout is `root > body (wheel_rear, stand, tail_lights, seat_0, seat_1)` and `root > steer (wheel_front, headlights)`, with a fold bone and a glow bone per wheel. Empty strut bones parent directly to `steer` and `body` at the front and rear axle pivots. They follow only the fold position keys in deploy, folded and retract clips; the generator rejects any fold ancestor so the struts remain vertical during the wheel roll. The model follows `AREA_CUBE_ALLOCATION` in `tools/scooter_dims.py` and a 6,000-cube ceiling. Curved panels with two rotation axes are registered assemblies (0167). The rear lamp follows the spike's scaled horizontal superellipse housing, with a separate red dome and chrome cage above the main lens. The 3.0 by 3.3 plate reads `MDR` / `39`; no logo, maker name or real plate text appears.

**Floor board.** `FLOOR_STRIPS` in `tools/scooter_dims.py` declares three matching composite strips per side at x = 1.2, 2.35 and 3.5 px, inside the outer chrome edge at 3.95 px. Each strip is 0.28 px wide: a 0.08 px `body_tread` rubber line between two 0.10 px `chrome` lips. The lips rise 0.24 px from the deck; the rubber rises 0.225 px, leaving a shallow 0.015 px recess. The 1.15 px centre spacing leaves 0.87 px painted gaps. All three parallel deck runs extend from z = -4.5 to 3.95 px with matching 0.22 px rivet caps at the rear. Including the 0.65 px front curl, they cover roughly 90% of the board length. Only the innermost strips continue up the shield with the existing 2.19 px rise and 0.6 px offset. The outer strips curl forward 0.65 px and upward 0.50 px, with rivet caps at their tips. The 0.14 px outer edge follows the curl and a rear step rising 0.35 px over 0.2 px, then continuing to z = 4.6 px and returning across the board. Painted backing supports both raised ends. The lower edge follows a smooth route outside the roll; both edge trims use the uniform `body_edge` chrome region, avoiding a repeated gradient at every tube segment. Curve sampling doubles to eight steps. The existing deck and roll skins, rider foot positions and seat locators remain unchanged; no bones or paint regions are added. The lower centre tunnel narrows to a 0.95 px half-width at y = 5.6 and blends back to its existing width at y = 8.65, exposing the innermost rails without lifting them off the deck. The floor uses 292 cubes with an allocation of 292; only this allocation increases, bringing the total allocation to 3,867 and generated count to 3,822 under the unchanged 6,000 ceiling.

**Previews.** Eight README previews show the white scooter: front-left, flying with headlights, side, rear, tail lights at dusk, underbody from below front-right, running board from above front-left, and front wheel from front-left. Each detail view has its own frame; model-space boxes select regions inside a bone without changing the model or the existing preview frames. The three lower-body close-ups use the road pose with lamps off and no hover discs.

**Per-kind values.** `SCOOTER_SPEC` holds every number. The ground speeds are copies of the SUV's, not imports (0050). The collision box is 0.8125 blocks wide and 1.5625 high, with a 1.3-block footprint.

**Lean and steer.** The drive eases a lean angle toward the steering input scaled by speed, up to 20 degrees at 2 degrees per tick, and writes `yasu_ride:lean`. It writes `yasu_ride:steer` (up to 30 degrees) from the stick. The client turns the steer bone about the measured 20.9-degree inclined axis and rolls the root by lean minus bank. Out of car form the lean eases back to upright. The riders' lean is stepped (0250): the drive reports a signed level of -3 to 3.

**Stand.** `yasu_ride:stand` is true when nobody is aboard and no driver is awaited, the speed is under 0.01 blocks per tick and the scooter is not on water. The client lowers the stand then and raises it otherwise.

**Flat-wheel flight.** The scooter reuses the transforming drive (takeoff, hover, landing) without a submarine form. On take-off each wheel and hub drops 3.5 px and turns 90 degrees until its plane is horizontal, with a glow disc and hover particles underneath; landing reverses it before touch-down. The fender, fork and suspension stay in place, and a chrome strut rod on its own bone follows the drop (not the roll) so each hub stays joined to the body. Two parallel hinged links were rejected because they move the wheel about 2 px inward. The shared drive gains no scooter branch: the kind passes its own `TransformingSpec`.

**Water.** The kind declares `waterPolicy: "surface"`. It never enters the submarine form, runs on the surface at its ground speed, floats level and still with no driver, is pushed back up when it is submerged, and can take off from the surface.

**Step probe.** The step-up probe lane offset is a per-kind value (`stepLaneOffset`, 0.25 blocks for the scooter), so a narrow body does not step up on blocks beside it.

**Everything else is shared.** Paint, the headlight switch (headlight, tail light and amber lamp on one `yasu_ride:headlights` property), ramming, fleet limits, placement, and the engine and hover sounds use the existing mechanisms. The scooter engine plays its own recorded Vespa clips (`yasu_ride.scooter_engine_0..5`), idle at band 0 and revving slices ordered from low to high above it, with per-clip loop lengths and volumes owned by `tools/scooter_sound.py`. Hover sounds remain shared.

## Consequences

The kind adds three entity properties (`lean`, `steer`, `stand`) to the four it shares with the other transforming kinds (`form`, `bank`, `gear_down`, `headlights`), seven in all and within the 32-property limit. The Resource Pack version is bumped (0015). The rotation order of compound cubes (0167) and the riders' poses (0250) still need device confirmation, which is why this ADR stays Proposed; the manual checks list them. The scooter is the first kind with `waterPolicy: "surface"`, so a later wheeled kind that must float can reuse it.

Rider lean uses seven stepped poses because a player animation cannot read the vehicle's lean property, so large angles can look offset from the body. If the owner rejects that look on a device, the fallback is a vehicle-only lean, which needs the owner's agreement.
