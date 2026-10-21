# 0079. Roll the sports boat by its signed speed

- Status: Accepted
- Date: 2026-10-20
- Supersedes in part: 0059 (the sign of the roll target)

## Context

0059 rolls the sports boat into a turn: the target is `maxRoll` times the heading change divided by `turnRate`, times the speed divided by `maxSpeed`, and positive lowers the right side when the heading turns right. The code took the speed as a magnitude, so the roll followed only the heading change. In reverse the heading turns the other way for the same stick, so the hull leaned to the opposite side from forward driving, although the hull's lateral acceleration (speed times yaw rate) keeps its sign. Measured afloat with the stick at moveX 0.5: forward (moveY 1) the heading changes by -3 degrees per tick and the roll settles at -10; reversing (moveY -1) at -0.2 blocks per tick the heading changes by +3 degrees per tick and the roll settled at +1.79. 0061 raised `maxRoll` to 20 and the rate to 2 degrees per tick and kept the sign.

## Decision

- Afloat, the roll target is `clamp(heading change / turnRate, -1, 1) * clamp(speed / maxSpeed, -1, 1) * maxRoll`, with the signed speed. The roll's sign is the sign of speed times yaw rate: positive lowers the right side when the boat moves forward and its heading turns right, or moves backward and its heading turns left
- Aground the target stays 0. `maxRoll` (20) and the rate of 2 degrees per tick stay as 0061 sets them, and the animation and the entity property do not change
- Everything else in 0059 and 0061 stays

## Consequences

- With the same stick, forward and reverse driving now both lean the hull toward the stick side, although the heading turns the other way in reverse
- Reverse is capped at 0.2 blocks per tick (0051), so a reversing roll stays below about 3.6 degrees (0.2 / 1.12 * 20)
- The roll range stays -20 to 20, so neither pack changes and the Resource Pack keeps its version
- The SUV and camper bank (0026, 0044) does not depend on speed and runs only in forms whose throttle never reverses, so it keeps its rule
