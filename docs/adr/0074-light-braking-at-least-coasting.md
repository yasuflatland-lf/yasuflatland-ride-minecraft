# 0074. Light braking is never weaker than coasting

- Status: Accepted
- Date: 2026-10-20
- Extends: 0002, 0018

## Context

0002 sets braking to 0.04 and coasting deceleration to 0.02 blocks/tick per tick. 0005, kept by 0018, applies the throttle mapping backward too, so a throttle against the direction of travel brakes by `brake × |throttle|` per tick, while a released stick coasts down by `drag` per tick. 0018 maps the forward/back stick value past the 0.1 deadzone to a throttle that reaches full at 0.5, so `moveY` between -0.25 and -0.1 gives a throttle between -0.5 and -0.2. Every kind uses `brake` 0.04 and `drag` 0.02, so a light pull on the stick removed 0.008 to 0.02 blocks/tick per tick, less than letting go.

From 0.9 blocks/tick the SUV and the camper stopped in 45 ticks with the stick released, but in 90 ticks at `moveY` -0.125 (throttle -0.25), 57 at `moveY` -0.2, 112 at `moveY` -0.101 just past the deadzone, and 23 at full stick. The sports boat from 1.12 needed 56 ticks released and 112 at `moveY` -0.125. The same held in reverse: a light forward push slowed a reversing vehicle less than releasing the stick. A player who eases the stick back to slow down found the vehicle rolling further than if they had let go.

## Decision

- In one tick, braking removes `max(drag, brake × |throttle|)` from the speed: `throttle > 0` while reversing adds it, `throttle < 0` while moving forward subtracts it
- This applies to every kind through the shared `updateSpeed` in `motion/motion.ts`, in both directions, wherever a throttle against the direction of travel reaches it: the SUV and the camper in car form, and the sports boat afloat. Out of car form a pulled-back stick never reaches `updateSpeed` (0032, 0040), so there only a forward push while moving backward can brake
- Acceleration, reverse acceleration, creep, coasting and the speed limits are unchanged. A braking tick may still cross zero, as before

## Consequences

- Any pull against the direction of travel slows the vehicle at least as fast as releasing the stick. From 0.9 blocks/tick the SUV now stops in 45 ticks at `moveY` -0.125 and -0.2, the same as coasting
- Braking at `|throttle|` of 0.5 or more (`moveY` past -0.25 or 0.25) is unchanged, since `brake × |throttle|` is then at least `drag`. No per-kind constant changes
- Between the deadzone and half stick, braking feels the same as coasting rather than graded. Revisit if a kind gets `brake × 0.2` above its `drag`, or if players ask for a finer light brake
