# 0080. A beached sports boat can only reverse

- Status: Superseded in part by 0150 (lava also counts as afloat)
- Date: 2026-10-20
- Supersedes in part: 0051 (a beached boat coasting to a stop, and the boat never leaving the water by itself)

## Context

0051 lets the sports boat be placed on land (placement surfaces `water` and `top`) and says that, beached, it coasts to a stop. The drive passed a neutral input to the ground motion step whenever the boat was not afloat, so a boat placed on land, pushed ashore by a piston, or left on land when the water under it was drained could not move at all: in the drive's unit model, a 30-tick run with the stick pulled back or pushed forward kept its speed at 0. The player had to break the boat and place it again.

Letting a beached boat drive forward would let it drive inland like a car. Letting it reverse is enough to get it back into the water from a shore.

## Decision

- A sports boat that is not afloat (no water at its feet or 0.3 blocks below them, 0051) drives with a reverse-only input: forward throttle becomes 0, reverse throttle and steering are kept, and creep and the handbrake are off. Creep is off because it drives forward
- It reverses with the boat's own limits: the drive asks for an acceleration of 0.01125 blocks/tick per tick up to 0.2 blocks/tick (0051). Steering turns it as it does when reversing afloat
- It still never steps up a block, so a one-block bank stops it in either direction
- This covers a boat placed on land, one pushed ashore by a piston, and one whose water was drained; the drive decides afloat or beached every tick, so no separate rule is needed for how it got there
- Docking (0063), the water drag estimate (0053), and the level trim and roll aground (0059) are unchanged

## Consequences

- A player can back a beached boat into the water instead of breaking and placing it again
- Forward motion stays blocked on land, so the boat cannot drive inland. A player can still reverse it across flat land indefinitely; we accept this
- A boat reversing afloat over a flush beach no longer stops when it leaves the water; it keeps reversing on land. Driving forward, a flush beach and a one-block bank still stop it as 0051 says
- Reversing on land above `SPEC.ramMinSpeed` (0.15 blocks/tick) rams what is behind the boat with the same reach and damage as reversing afloat, because `selectHits` uses the size and sign of the speed and does not know whether the boat floats
- The speed on land was not measured in game. The unit model reaches 0.2 blocks/tick with the engine on the ground and the default ground friction; if the engine reports a beached boat as not on the ground, the ground step applies air friction and air control and the boat reverses more slowly. Manual rows B2 and B4 check that it reverses on land and off a flush beach
- Revisit if players use reversing to move boats far over land, for example by capping how far a beached boat may reverse, or if the manual check finds a beached boat that does not move
