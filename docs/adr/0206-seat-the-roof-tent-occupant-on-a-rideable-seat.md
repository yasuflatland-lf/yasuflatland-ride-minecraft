# 0206. Seat the roof tent occupant on a rideable seat

- Status: Proposed
- Acceptance condition: owner confirms in game
- Date: 2026-11-03
- Extends: [0200](0200-roof-tent-as-a-host-bound-camp-entity.md): roof tent occupant seating and dismount detection

## Context

The per-tick teleport hold introduced in the previous commit of this PR fights
client gravity and shakes the camera. The server repeatedly returns a falling
occupant to the tent interior while the client continues applying gravity.

ADR 0200 does not prohibit a rideable component. The current camping gear spec
says, "The tent is a persistent, unpushable, damage-proof, summonable entity with
no gravity, physics collision, rideable, or interact component." That clause is
under ground tent entity interaction and remains the ground tent contract.
The roof tent access rule is what changes: it previously required the cleanup
interval to call `holdInside` and teleport displaced occupants back each tick.
This ADR extends 0200 and replaces that roof tent spec rule.

## Decision

- The roof tent base entity carries one `minecraft:rideable` seat for a player,
  including ground, camper, and SUV placements. It retains no gravity, no physics
  collision, non-pushability, damage immunity, and persistence. The rideable has
  `crouching_skip_interact: true` and no `interact_text`.
- Entry teleports the player near the seat in the tent's dimension, then calls
  `addRider`. An already seated player stays in place. A missing rideable,
  rejection, or exception leaves a one-shot teleport fallback to `seatPosition`;
  entry does not fail because seating failed. There is no per-tick teleport hold.
- The JSON seat y is `seatLift + seatRiderOffset`: `(5 + 2.4) / 16 + 0.35`, or
  0.8125 blocks above the tent origin. The feet position used for the fallback
  remains `seatLift`. The 0.35 rider offset follows the Java ridingOffset
  convention; the Bedrock value is unmeasured and the owner tunes it live.
- The tent's sneak entry and occupant menu flow remain unchanged because
  `playerInteractWithEntity` is cancelled before the default rideable action.
- The cleanup interval requires release of entry sneak before another sneak
  requests leaving. A dismounted occupant is re-seated once per tick while entry
  sneak has not been released or fewer than 10 loaded, valid-player tracking ticks
  have elapsed. At most 40 re-seat attempts are allowed. After this grace, a
  dismount invokes `LeaveRoofTent`, placing the player outside and clearing
  occupancy. Sneak after release still leaves immediately, before seating checks.
- An unloaded tent produces an unknown seating state and skips dismount handling.
  Outside placement ejects a seated rider before teleporting and also accepts an
  already dismounted occupant. Existing occupancy mismatch, offline grace, and
  player lifecycle cleanup remain in effect.

## Consequences

The engine seat holds the player instead of competing client gravity and server
teleports. The rider offset, first-person fit, and camera stability are unverified
in-game until the owner confirms. Holding sneak at entry may cause vanilla to
dismount immediately; bounded re-seating tolerates that race but may still expire
while sneak remains held. The owner must check this on PC and touch controls.
A failed seat mount can leave a player at the teleport fallback until the next
re-seat attempt or exit. Revisit the offset and grace values after live checks.
