# 0082. Learn strongly slowing surfaces

- Status: Accepted
- Date: 2026-10-20
- Supersedes in part: 0003 (which axes count as a wall on the ground, and the lower clamp of the friction estimate)

## Context

0003 reads an axis as a wall when it keeps less than half the friction estimate of the velocity given on it, takes a friction sample only on ticks without a wall, and clamps each sample to 0.5-1. A surface that slows the vehicle strongly, such as soul sand, slows every axis the same way, so these rules mistake it for a wall. In a simulation of the driving core on 5d2d8d6, where the engine keeps k of the given velocity, the SUV at full throttle for 200 ticks never got a friction estimate for k <= 0.34 and crawled at 0.010-0.021 blocks/tick (k = 0.22: 0.0105, k = 0.30: 0.0173, k = 0.34: 0.0212). For 0.35 <= k < 0.5 the estimate was clamped to 0.5, so top speed was capped at k / 0.5 x 0.9 (k = 0.35: 0.63, k = 0.40: 0.72).

A wall is different: the engine zeroes the velocity on the walled axis (0003), so the kept ratio on that axis is 0, or the axes disagree when the vehicle meets the wall at an angle.

With the rule below and the slide rule of 0081 in place, the same simulation gives these results. On uniform k from 0.20 to 1.00 at headings every 7.5 degrees, the estimate converges to k within 60 ticks and the SUV reaches 90% of its maximum speed by tick 36. A wall hit at 5 to 85 degrees from head-on on k from 0.2 to 1 keeps the estimate and the along-wall speed of 0081. A head-on wall is still read as a wall, freezes the estimate at the value it had learned on that surface, and stops the vehicle. These are model results, not in-game measurements. Whether the game's slow surfaces scale velocity that a script sets uniformly is not measured yet. The in-game test suv_soul_sand checks the outcome.

## Decision

On the ground (stepMotion), an axis is driven when the velocity given on it last tick is above 0.03 (blockedAxisMin). A driven axis is a wall when it kept less than 0.15 (wallKeptMax) of the given velocity, or when it kept less than half the friction estimate (blockedRatio) while the other axis is driven and kept at least half the estimate. An axis that is not driven is never a wall. A tick with no wall axis takes a friction sample as before, now clamped to 0.2-1 (frictionMin 0.2). The sample threshold (0.05) and the exponential moving average (0.2) are unchanged. The medium step under water and in the air and the sports boat's water-drag estimator keep the per-axis check of 0003, 0053 and 0081.

## Consequences

- The vehicle drives at its normal speed on surfaces that keep at least 0.2 of the velocity each tick
- A driven axis that keeps less than 0.15 of the velocity is still read as a wall, whether one axis or every driven axis slows that much. Surfaces that keep between 0.15 and 0.2 are learned as 0.2, so top speed is capped at k / 0.2 x 0.9
- When both axes are driven and they disagree across half the estimate, the lower one is still a wall, as in 0003. When only one axis is driven, a slowdown on it that keeps at least 0.15 (a slope, a pushed mob, a slow surface) is now a friction sample where 0003 read a wall
- Leaving a slow surface, the estimate catches up through the moving average, so for some ticks the engine keeps more of the pre-divided velocity than the target. In the simulation, after learning 0.2 and driving onto a surface that keeps 0.69, the SUV moved 3.10 blocks on the first tick, stayed above 1.0 for 9 ticks, and was back within 1% of its maximum speed after 25 ticks; the bound is the maximum speed divided by 0.2, 4.5 blocks/tick. With the old 0.5 clamp the worst case was 1.24. Ram damage uses the internal speed and is not raised. Whether such a tick passes through thin blocks in game is not measured
- The tick on which the body first reaches a wall keeps only part of the velocity on the walled axis without reading as a wall, and its friction sample is no longer clamped at 0.5. The estimate dips a little more on impact, so the slide along the wall runs slightly faster: the in-game test wall_diagonal measured a peak along-wall speed of 0.413 blocks/tick against 0.402 before this change, and its limit was raised from 0.1 to 0.12 above the speed before the hit
- The camper's end guard (0067) looks ahead by the pre-divided velocity, so on a surface learned as 0.2 it looks about 4.5 blocks ahead at full speed instead of about 1.3, and the camper stops up to that far short of a wall
- Property tests in tests/domain/vehicle/motion/motion.test.ts guard the rule: the estimate converges for every uniform k in 0.2-1, a head-on wall still freezes it, the angled-wall slide of 0081 holds from k = 0.2, and leaving a slow surface stays below 4.5 blocks/tick and settles within 25 ticks
- Revisit wallKeptMax and frictionMin if suv_soul_sand or a later in-game measurement shows a surface keeping less than 0.2, or a wall that keeps more than 0.15. Revisit the moving average if the overshoot after a slow surface is visible in play
