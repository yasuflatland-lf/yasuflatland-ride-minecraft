# 0250. Scooter rider grip pose and stepped lean

- Status: Proposed
- Acceptance condition: the owner records the PC and mobile results of the checks below in this ADR and accepts it in #1750
- Date: 2026-11-16
- Extends: [0238](0238-lounge-pose-by-overriding-the-player-client-entity.md): the player client override and `Entity.playAnimation` method
- Related: [0001](0001-bedrock-addon-with-stable-script-api.md): stable APIs only

## Context

The scooter's riders should hold the handlebar and lean into turns with the vehicle. Stable Script API has no player posture setter, so the pose uses the method that 0238 proved for the lounge: an animation defined in the overridden `minecraft:player` client entity and played with stable `Entity.playAnimation`. The scooter must not depend on this until the owner confirms it works on devices.

## Decision

Add seven looping animations to `animations/yasu_ride/player.anim.json` and register them in `description.animations` of `entity/yasu_ride/player.ce.json`, never in `scripts.animate`, as 0238 does for `lounge`:

- `animation.yasu_ride.player.scooter_grip`: arms rotated to x -70 degrees to reach the grips, legs standing straight on the floor board. Both cancel the vanilla riding rotation with the `this` expression.
- `animation.yasu_ride.player.scooter_lean_l1` to `_l3` and `_r1` to `_r3`: the grip pose plus a waist roll about z of 8, 16, and 24 degrees, positive for left and negative for right. The level count and angles are tuning values.

The test pack handles `scriptevent yasu_ride_test:scooter_pose <level>` (`grip`, `l1` to `l3`, `r1` to `r3`). It mounts the nearest rideable like the lounge probe and plays the pose on controller `yasu_ride.scooter_pose` with `stopExpression: "!query.is_riding"` and a blend-out time of 0.15 seconds. The level table and blend time live in one constant in `src/test-pack/scooterPoseProbe.ts`.

If any owner check fails, stop and report to the owner. The fallback, where only the vehicle leans, needs the owner's agreement; do not switch approaches automatically.

## Consequences

The override gains seven animation entries, so the vanilla fixture comparison pins vanilla plus `lounge` plus these entries. The Resource Pack version is bumped (0015). The pose cannot be proven by unit tests; the roll sign and grip alignment are judged on devices. Nothing in the scooter depends on the pose until this ADR is accepted.

## Owner checks

1. PC and mobile: the grip pose and each lean level look right in first and third person, and other players see them. **Pending**
2. Switching levels looks smooth with blend times between 0.1 and 0.25 seconds. **Pending**
3. Dismounting restores the normal pose and ordinary animations stay intact. **Pending**
