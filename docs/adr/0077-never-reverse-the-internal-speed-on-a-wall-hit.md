# 0077. Never reverse the internal speed on a wall hit

- Status: Accepted
- Date: 2026-10-20
- Supersedes in part: 0003 (lowering the internal speed to a backward actual forward speed after a wall hit, and the reverse-limit clamp that came with it)

## Context

0003 detects a wall per axis and, while colliding, lowers the internal speed to the actual forward speed, then clamps it at the reverse limit because a backward actual forward speed could push it below that limit. A wall often bounces the body slightly backward, so the actual forward speed has the opposite sign of the internal speed, and the internal speed flipped sign for that tick. In the driving core on 5d2d8d6, a vehicle at internal speed 0.1 observed at -0.01 on a wall tick on the ground left the tick at -0.01; with gravity off, 0.1 observed at -0.05 left it at -0.05.

The flipped sign was read as reversing. The camper's body guard checks the end the signed speed points to, so a nose-first wall contact was checked on the rear end for that tick. The reversed speed carried into the next tick, where forward throttle braked instead of accelerating, and steering, which follows the sign of the speed, could turn the opposite way.

## Decision

- On a wall tick, the internal speed is lowered toward the actual forward speed but never past 0: if the actual forward speed is at least as large as the internal speed in magnitude, the internal speed is kept; otherwise a forward internal speed becomes the actual forward speed clamped to [0, speed], and a reverse one becomes it clamped to [speed, 0]
- This applies to the ground step and to the gravity-off step (air, water and the floating sports boat) alike
- The separate clamp at the reverse and forward limits is dropped, because the result already lies between 0 and a speed that is within those limits

## Consequences

- A wall can stop a vehicle but never turns it around; a body bounced backward ends the tick at speed 0, and the next tick accelerates from 0
- The camper's body guard keeps checking the end the vehicle was moving toward on a wall tick
- Revisit if a later change wants a wall to push the vehicle back on purpose
