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

**Wheels.** Both wheels retain white tyre walls, beige discs and chrome dishes. Four raised chrome hex nuts sit at 90-degree intervals with a 45-degree phase on a 0.82 px bolt circle on each exposed negative-x face, opposite the fork and spring. Each 0.32 px-deep nut rises over a wider dark round washer and has a dark hexagonal bevel border around its light face. Each raised part uses one cutout face, avoiding crossed reflection bands. The centre has a 0.55 px-radius round boss, a 0.43 px-radius washer step and a 0.30 px-radius hex nut. Six 0.19 px-radius dark slotted screw heads sit on a distinct painted outer rim ring. Revolved skins form the exposed dish's raised inner hub, recessed step and rolled outer lip, plus a wider polished bead beside a dark line; new relief stays on the negative-x face clear of the fixed suspension. The tyre is a smooth 64-segment carcass with no tread pattern or grooves; its trapezoidal section has a flat, solid-black crown reaching the 4.3 px rolling radius, and its inner side, hidden behind the whitewall disc, has no cubes. Rear radial and hardware dimensions scale by 0.96. No bones, paint regions or material types are added, and roll and fold retain their clearance. Each running wheel assembly contains 777 cubes; their wheel bones contain 780 including the discs and hub plates. The running allocation and usage are both 1,695; total allocation is 4,667 under the 6,000 ceiling. Front-left and rear-left close-ups show the hardware on both wheels.

**Previews.** Nine README previews show the white scooter: front-left, flying with headlights, side, rear, tail lights at dusk, underbody from below front-right, running board from above front-left, front wheel from front-left, and rear wheel from rear-left. Each detail view has its own frame; model-space boxes select regions inside a bone without changing the model or the existing preview frames. The four lower-body close-ups use the road pose with lamps off and no hover discs.

**Per-kind values.** `SCOOTER_SPEC` holds every number. The ground speeds are copies of the SUV's, not imports (0050). The collision box is 0.8125 blocks wide and 1.5625 high, with a 1.3-block footprint.

**Lean and steer.** The drive eases a lean angle toward the steering input scaled by speed, up to 20 degrees at 2 degrees per tick, and writes `yasu_ride:lean`. It writes `yasu_ride:steer` (up to 30 degrees) from the stick. The client turns the steer bone about the measured 20.9-degree inclined axis and rolls the root by lean minus bank. Hover and landing use the same lean sign, levels and speed scaling as car form. Releasing steering, take-off and a missing driver ease the lean back to upright. The riders' lean is stepped (0250): the drive reports a signed level of -3 to 3.

**Stand.** `yasu_ride:stand` is true when nobody is aboard and no driver is awaited, the speed is under 0.01 blocks per tick and the scooter is not on water. The client lowers the stand then and raises it otherwise; the raised stand lies horizontal under the floor, pointing at the front tyre (62 degrees forward of its resting lean).

**Flat-wheel flight.** The scooter reuses the transforming drive (takeoff, hover, landing) without a submarine form. On take-off each wheel and hub drops 3.5 px and turns 90 degrees until its plane is horizontal, with a glow disc and hover particles underneath; landing reverses it before touch-down. The fender, fork and suspension stay in place, and a chrome strut rod on its own bone follows the drop (not the roll) so each hub stays joined to the body. Two parallel hinged links were rejected because they move the wheel about 2 px inward. The shared drive gains no scooter branch: the kind passes its own `TransformingSpec`.

**Water.** The kind declares `waterPolicy: "surface"`. It never enters the submarine form, runs on the surface at its ground speed, floats level and still with no driver, is pushed back up when it is submerged, and can take off from the surface.

**Step probe.** The step-up probe lane offset is a per-kind value (`stepLaneOffset`, 0.25 blocks for the scooter), so a narrow body does not step up on blocks beside it.

**Everything else is shared.** Paint, the headlight switch (headlight, tail light and amber lamp on one `yasu_ride:headlights` property), ramming, fleet limits, placement, and the engine and hover sounds use the existing mechanisms. The scooter engine plays its own recorded Vespa clips (`yasu_ride.scooter_engine_0..5`), idle at band 0 and revving slices ordered from low to high above it, with animation cycle lengths, Ogg lengths, overlap and volumes owned by `tools/scooter_sound.py`. Rev animations repeat every 1.0 s and their raw clips last 1.05 s, without edge fades, to test the unverified sound restart-gap hypothesis. Consecutive instances overlap for 50 ms; reduced clip gain reserves headroom, but the relative overlap loudness bump remains a listening risk. Idle is unchanged. Hover sounds remain shared.

## Consequences

The kind adds three entity properties (`lean`, `steer`, `stand`) to the four it shares with the other transforming kinds (`form`, `bank`, `gear_down`, `headlights`), seven in all and within the 32-property limit. The Resource Pack version is bumped (0015). The rotation order of compound cubes (0167) and the riders' poses (0250) still need device confirmation, which is why this ADR stays Proposed; the manual checks list them. The scooter is the first kind with `waterPolicy: "surface"`, so a later wheeled kind that must float can reuse it.

Rider lean uses seven stepped poses because a player animation cannot read the vehicle's lean property, so large angles can look offset from the body. If the owner rejects that look on a device, the fallback is a vehicle-only lean, which needs the owner's agreement.
