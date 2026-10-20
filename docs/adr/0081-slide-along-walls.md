# 0081. Slide along walls

- Status: Accepted
- Date: 2026-10-20
- Supersedes in part: 0003 (the speed kept along a wall hit at an angle), 0077 (lowering the speed toward the actual forward speed while sliding along a wall)

## Context

0003 detects a wall per axis and, while colliding, lowers the internal speed to the actual forward speed, the observed velocity projected on the heading. 0077 keeps that rule but never lets it go past 0. 0003's Consequences expected the speed along the wall to stay around the along-wall component it had just before impact. It does not. When a vehicle hits a wall at an angle, the engine zeroes one axis, so the forward projection is only part of the along-wall speed, and the internal speed shrinks every tick. The next target also carries 1 - grip of the sideways velocity. Once the target on the wall axis falls to 0.03 or less, 0003 skips that axis, so the tick reads as free, the friction estimate samples a wall-distorted velocity, and the next tick is a wall again.

Measured in the engine model (the engine keeps k of the given velocity and a wall zeroes one axis), before this decision. 0077 does not change these numbers, because the forward speed stays positive in every case:

| Case | Along-wall speed | Blocked flips | Estimate |
|---|---|---|---|
| SUV on the ground, k = 0.69, 45 degrees | 0.636 to about 0.04 within 10 ticks | 57 in 74 ticks | friction 0.69 to 0.583 |
| SUV on the ground, 20 degrees from the wall plane | 0.846 to 0.095 after 30 ticks | | |
| Hover, drag 0.91, 45 degrees | 0.636 to about 0.03-0.06 | 73 | |
| Sports boat afloat, 45 degrees | 0.79 to about 0.04-0.07 | 68 | water drag 0.85 to 0.72 (0053) |

## Decision

- The per-axis detection of 0003 stays: same thresholds (`MOTION.blockedRatio`, `MOTION.blockedAxisMin`), and the friction estimate (and the boat's water drag estimate, 0053) takes no sample on a tick it fires
- When exactly one axis is blocked and the heading's component along the free axis is at least `MOTION.wallSlideMinCos` (0.05, about 2.9 degrees from head-on), and the vehicle still moves along the wall the way its heading points, the internal speed becomes the speed whose free-axis component equals the observed along-wall velocity: |v_free| / |f_free|
- Otherwise (both axes blocked, nearly head-on, or moving backward along the wall) it becomes the observed forward speed, never of the opposite sign, as in 0077
- In both cases the speed never rises and never changes sign: speed = sign(speed) x min(|speed|, kept)
- On a blocked tick the target carries no sideways velocity (the same as during a step jump, 0004), so the along-wall speed stays at its impact value instead of growing
- The target keeps pointing along the heading. The engine zeroes the wall axis every tick, so the wall check fires on every contact tick and no estimate is updated during contact. No extra state or hysteresis is needed
- `motion.ts` exports `blockedAxes` (which axes are blocked) and `speedAfterWall`; `hitWall` is `blockedAxes` with either axis set

## Consequences

- Measured in the engine model with this rule: the along-wall speed stays at its impact value (to 1e-14) for headings 3 to 87 degrees from head-on (0.636 at 45 degrees, 0.846 at 20 degrees from the wall plane), the blocked flag is set once and stays set, the friction estimate stays at 0.69 and the internal speed at 0.9. Hover at 45 degrees keeps 0.636; the afloat sports boat keeps 0.792 and its water drag estimate stays at 0.850
- Applies to every kind and form that uses the shared motion steps: the SUV and camper in car, hover and submarine forms, and the sports boat afloat and beached
- The camper's end guard (0067) runs after the motion step and still stops it dead when the cells ahead of its nose or tail are solid, so a camper whose nose meets a wall at an angle does not slide; it slides only where the guard sees no wall, for example along the side of its body
- Within about 2.9 degrees of head-on the vehicle stops as before; it does not creep along the wall
- Something that is not a wall but zeroes one axis, such as a mob pushed at an angle, now keeps the speed along the free axis instead of dropping it
- `wall_diagonal` stops measuring once the car's body passes the wall's far end, because the car now slides that far and drives on, and it asserts that the car is still sliding at the end of contact
- Revisit if riders find that sliding along walls feels wrong in game, for example in narrow tunnels
