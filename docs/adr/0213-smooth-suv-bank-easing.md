# 0213. Smooth SUV bank easing

- Status: Accepted
- Date: 2026-11-04
- Supersedes in part: [0026](0026-bank-into-turns-in-flight.md): SUV bank rate limit only
- Supersedes in part: [0044](0044-bank-under-water.md): SUV bank rate limit only
- Related: [0050](0050-vehicle-kinds-and-per-kind-profiles.md): per-kind easing selection

## Context

The SUV approaches its bank target at a constant 3 degrees per tick, taking 10 ticks from level to 30 degrees. The abrupt start and stop make the body roll look mechanical. The existing per-kind `bankEasing` parameter allows changing the SUV without changing the camper or bulldozer.

## Decision

Select `smooth` only in `SUV_TRANSFORMING`; the camper and bulldozer retain `constant`, with the existing `approach(prev, target, bankRate)` behavior. Keep all other decisions of 0026 and 0044, including target selection, hover-only bank sink, property synchronization, animation, and upright riders.

Smooth easing is a pure, stateless calculation from the previous bank, target, and spec:

- Let `f = clamp(abs(prev) / maxBank, 0, 1)`, or zero when `maxBank` is zero, and `d = abs(target - prev)`.
- The bell curve is `b = 4 * f * (1 - f)`.
- The step in degrees is `s = max(0.75, min(bankRate * (0.5 + 1.5 * b), 0.5 * d))`.
- Return the target exactly when `d <= s`; otherwise approach it by `s`.

Store the four tuning values in `MOTION.bankSmooth`. The factor 4 normalizes the bell to one at half bank. `bankRate` is a nominal rate for smooth easing, not a maximum. At the SUV's rate of 3, the curve starts at 1.5 degrees per tick and can reach 6 degrees per tick at half bank. Distance-proportional easing slows the arrival, with a 0.75-degree floor to guarantee completion. From level to either 30-degree limit takes 11 ticks; tests allow 10 through 13 ticks against the former 10-tick duration.

For finite bank angles and nonnegative finite specs in the vehicle's degree range, each step stays between the previous angle and target and reduces the remaining distance. A fixed target is reached within `ceil(abs(target - prev) / 0.75) + 1` ticks, allowing one tick for floating-point rounding. Zero maximum bank targets level without division by zero. Changes of target, reversals, and leveling use the same curve without timers or additional state.

## Consequences

The SUV eases away from level and into its target in both hover and submarine forms. Leveling after either form uses the same easing. Mid-bank steps can exceed the old 3-degree limit. The positive floor trades a small final snap for bounded settling; arbitrary target changes do not preserve angular velocity because the calculation has no velocity state.

Property tests cover direction, overshoot, progress, bounded settling, zero maximum bank, full-bank timing in both directions and banking forms, and constant-profile equivalence. Existing client animation and rider behavior remain unchanged; visual feel still needs an in-game assessment. Revisit the curve if that assessment finds the minimum step or reversal too abrupt.
