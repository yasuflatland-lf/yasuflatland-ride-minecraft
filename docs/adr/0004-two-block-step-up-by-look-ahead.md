# 0004. Climb two-block steps by looking ahead in the script

- Status: Accepted
- Date: 2026-10-10

## Context

We want vehicles to climb steps up to two blocks high and to stop at anything three blocks or higher as if it were a wall. One-block steps can be left to the entity's `minecraft:variable_max_auto_step`; this works even while the script is moving the vehicle. Two-block steps could not be climbed even with this value raised to 2.0625.

Making the script launch the vehicle upward ran into these problems, one after another:

- Jumping only after hitting the wall feels late, because the vehicle stops once and then hops
- With a look-ahead along the centerline only, a vehicle approaching at an angle hits the step with a corner first and stops before it jumps
- If the vehicle hits the side of the step before it has fully risen, it is pushed sideways along that side (4.78 blocks of sideways drift)

## Decision

- Leave one-block steps to `minecraft:variable_max_auto_step` (1.0625)
- For two-block steps, look ahead while driving and jump. The look-ahead distance is "speed × 4 + 0.3" blocks, measured from the front edge of the collision box
- Look ahead along three lines: the centerline and the left and right edges (±0.8 from the center). If any line finds "a two-block step with at least 1.6 blocks of clear space above it", give an upward velocity of 0.75
- Do not jump if any of the three lines has an obstacle three blocks or higher, or if there is no room for the vehicle on top of the step
- For 10 ticks after the jump, keep controlling the vehicle in the air and cancel sideways velocity

## Consequences

- In the spike, the vehicle landed on top of a two-block step with 0.00 sideways drift, both head-on and at a 30° angle
- The jump peaks about 0.9 blocks above the top of the step. If the hop feels wrong, tune the upward velocity
- With only three look-ahead lines, a step that catches just the edge of the vehicle (0.8–0.9 from the center) can be missed, and the vehicle stops as if at a wall
- Correction (2026-11-04): two statements above do not match the current code and the vehicles' sizes.
  - The three look-ahead lines (the centerline and ±0.8, `MOTION.stepLaneOffset` in `src/domain/vehicle/motion/constants.ts`) are not the edges of the vehicle. The SUV's collision box is 2.68 blocks wide (half width 1.34), and the camper's `bodyHalfWidth` is 1.5 (its collision box is 3.0 wide). A one- or two-block step that lies only in the outer band, beyond 0.8 and out to 1.34 blocks to the side for the SUV or 1.5 for the camper, gets a jump height of 0, so the vehicle stops at it as at a wall. The blind gap is wider than the "0.8–0.9 from the center" the original Consequences named
  - "The jump peaks about 0.9 blocks above the top of the step" was never measured, and it does not agree with the calculation model of ADR 0035. The vehicle still climbs two-block steps as decided
