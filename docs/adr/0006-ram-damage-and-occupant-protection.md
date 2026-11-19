# 0006. Ram damage detection, and always protecting occupants

- Status: Accepted
- Date: 2026-10-10

## Context

There are two requirements. Whatever the vehicle hits takes damage that scales with speed and is pushed aside. People riding in a vehicle take no damage from collisions or falls. The two conflict when the target is someone riding in another vehicle.

In the spike, every tick the script searched an area in front of the vehicle and damaged whatever it found. With a narrow area the vehicle passed through targets; with an area extended too far forward, targets were hit before contact. That riders take no damage was confirmed in game by crashing into a wall and by a 10-block fall. The code does not guarantee it, though: the vehicle's `minecraft:damage_sensor` protects only the vehicle.

## Decision

- The detection area is a rectangle in front of the vehicle. Its depth is the front of the visible body (1.85 from the center) plus half the target's body width (0.45); its width is the body's half-width (1.1) plus 0.45
- Hit only while moving forward faster than 0.15 blocks/tick (`SPEC.ramMinSpeed`), or reversing faster than the kind's `ramMinReverseSpeed`. The forward threshold is shared so that creeping (0.12, ADR 0018) and the step bump (`MOTION.stepMinSpeed`, 0.15) never ram. Reversing has neither, so each kind sets its reverse threshold at three quarters of its full reverse speed: 0.15 for the SUV, scooter and sports boat, 0.1125 for the camper and 0.075 for the bulldozer. A single 0.15 kept the camper (full reverse 0.15) and the bulldozer (0.1) from ever ramming in reverse
- On a hit, deal `round(20 × speed)` damage and knock the target in the direction of travel (horizontal `0.5 + 2.5 × speed`, upward 0.35). Do not hit the same target again within 10 ticks
- Always protect riders. Never hit the occupants of your own vehicle or of another vehicle
- Make the vehicle immune to all damage with `minecraft:damage_sensor`
- Leave rider damage immunity to the engine's behavior and catch regressions with in-game tests. If a test shows it broken, design an additional mechanism that cancels occupant damage only while riding

## Consequences

- When two vehicles collide, neither vehicle's occupants take damage
- Positions are computed on the server, so at high speed a hit can land up to one tick (0.9 blocks at max speed) before it appears to
- The distance covered in one tick (at most 0.9) is shorter than the detection depth (2.3), so the vehicle cannot pass through a target
