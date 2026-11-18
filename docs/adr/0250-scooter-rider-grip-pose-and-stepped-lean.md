# 0250. Scooter rider grip pose and stepped lean

- Status: Proposed
- Acceptance condition: the owner records the PC and mobile results of the checks below in this ADR and accepts it in #1750
- Date: 2026-11-16
- Extends: [0238](0238-lounge-pose-by-overriding-the-player-client-entity.md): the player client override and `Entity.playAnimation` method
- Related: [0001](0001-bedrock-addon-with-stable-script-api.md): stable APIs only

## Context

The scooter's driver should hold the handlebar and its passenger should hold the seat's rear edge, both seated and leaning into turns with the vehicle. Stable Script API has no player posture setter, so the pose uses the method that 0238 proved for the lounge: an animation defined in the overridden `minecraft:player` client entity and played with stable `Entity.playAnimation`. The automatic wiring remains Proposed until the owner confirms its visual behavior on devices.

## Decision

Add fourteen looping animations to `animations/yasu_ride/player.anim.json` and register them in `description.animations` of `entity/yasu_ride/player.ce.json`, never in `scripts.animate`, as 0238 does for `lounge`:

- `animation.yasu_ride.player.scooter_grip`: arms rotated to x -70 degrees to reach the grips, legs swung 35 degrees forward (x -35) so the feet land near the floor board. Both cancel the vanilla riding rotation with the `this` expression.
- `animation.yasu_ride.player.scooter_lean_l1` to `_l3` and `_r1` to `_r3`: the grip pose plus a waist roll about z of 8, 16, and 24 degrees, positive for left and negative for right. The level count and angles are tuning values.
- `animation.yasu_ride.player.scooter_pillion_grip` and `scooter_pillion_lean_l1` to `_l3` and `_r1` to `_r3`: the passenger set, copies of the driver ones with the arms at x 20 degrees (`20.0 - this`, swung backward to hold the rear edge of the seat). The legs and waist roll match the driver's.

The test pack handles `scriptevent yasu_ride_test:scooter_pose <level>` (`grip`, `l1` to `l3`, `r1` to `r3`, and the passenger levels `pgrip`, `pl1` to `pl3`, `pr1` to `pr3`). It mounts the nearest rideable like the lounge probe and plays the pose on controller `yasu_ride.scooter_pose` with `stopExpression: "!query.is_riding"` and a blend-out time of 0.15 seconds. The level table and blend time live in one constant in `src/test-pack/scooterPoseProbe.ts`.

The scooter profile supplies a `RiderPoseTable` containing immutable `SeatPoseTable` entries indexed by the same seat slot as `RiderView.slot`, plus a shared refresh interval, to the kind-neutral `RiderPoseState` in the vehicle core. Each seat table contains its grip pose and stepped-lean poses ordered strongest left to strongest right, with no upright entry. Seat 0 supplies the driver `scooter_grip` and `scooter_lean_*` table; seat 1 supplies the passenger `scooter_pillion_grip` and `scooter_pillion_lean_*` table in the same order. Both use the same driver `riderLean` level. Both torsos stay upright, with seated legs swung 35 degrees forward; only the arm poses differ. Seat positions and model locator heights remain unchanged pending device feedback. The core receives each rider's ID and slot; a slot without a table receives no pose and is treated as absent, clearing any previously sent pose once. The scooter drive reports its signed lean level; the core emits pose changes for its own driver and passenger and clears departing riders. The application applies these commands through the `RiderPose` port immediately after step commands, within their resync boundary. `BedrockRiderPose` plays the profile entries on the proven controller and clears by replaying the last pose with stop expression `1`. A 20-tick refresh interval, matching the beach chair lounge interval, makes the current pose visible to late joiners within a second (0238 check 4). The refresh replays an unchanged pose with blend-out time 0, because the animations cancel vanilla rotation with `this`, which also counts an instance still blending out; a changed pose keeps 0.15 seconds (issue 1930).

If any owner check fails, stop and report to the owner. The fallback, where only the vehicle leans, needs the owner's agreement; do not switch approaches automatically.

## Consequences

The override gains fourteen animation entries, so the vanilla fixture comparison pins vanilla plus `lounge` plus these entries. The Resource Pack version is bumped (0015). The pose cannot be proven by unit tests; the roll sign and grip alignment are judged on devices. Automatic scooter pose wiring is implemented, but its grip alignment, lean and transition appearance remain unverified on devices while this ADR is Proposed.

## Owner checks

1. PC and mobile: the grip pose and each lean level look right in first and third person, and other players see them. **Pending**
2. Switching levels looks smooth with blend times between 0.1 and 0.25 seconds. **Pending**
3. Dismounting restores the normal pose and ordinary animations stay intact. **Pending**
4. Two riders: the passenger holds the seat's rear edge and both look seated, in first and third person, on the ground and in flight. **Pending**
5. One and two riders: hips sit on the seat, in first and third person, on the ground and in flight. **Pending**
