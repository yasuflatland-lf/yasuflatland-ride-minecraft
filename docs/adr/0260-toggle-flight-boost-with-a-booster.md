# 0260. Toggle flight boost with a booster

- Status: Accepted
- Decided in: #2465
- Date: 2026-11-25
- Extends: [0021](0021-flight-mode.md): flight speed and climb
- Related: [0171](0171-sports-boat-equipment-and-icebreaker-mode.md): independent switch cooldowns
- Related: [0224](0224-third-person-switch-feedback-and-bulldozer-camera.md): switch feedback

## Context

The driver needs a way to cross long distances faster in any flying vehicle. Flight motion already caps horizontal speed and vertical climb. A higher cap allows faster travel without changing acceleration. The booster needs to work alongside headlights and equipment switches and stay active while the driver holds another item.

## Decision

- Offer the single-stack `yasu_ride:booster` in the Creative Items category alongside the headlight switch. It has no recipe.
- Only the current driver can toggle boost while riding. The switch handles item use and entity presses on the ridden vehicle. Block presses keep their normal behavior. Each vehicle has a 10-tick idle cooldown for the booster, independent of its headlights and equipment switches.
- Flying kinds opt in through `BoostRule` and expose `BOOST_CONTROL`. The drive owns the transient state. Switching held items preserves it. The effect is inactive with no driver or during a handover. Each new driver starts with boost off, including a passenger who takes over. Rebuilding the vehicle starts with boost off.
- In flight, boost triples the normal horizontal top speed and vertical climb limit. Acceleration, braking, drag, takeoff climb and landing sink keep their usual values. The driver may enable boost in car or submarine form for the next flight. When flight boost ends, the horizontal cap falls by one tenth of the normal top speed per tick. Air and car motion use this falling cap so the vehicle can shed the extra speed gradually. Submarine motion uses its normal limit.
- A successful toggle plays the headlight switch click and shows Boost ON or Boost OFF when the rider's third-person camera is active. The sports boat has no flight control. Its driver's press shows “This vehicle cannot use a booster.” in any camera.

### Alternatives considered

- Swap in a boosted spec for each kind. This would duplicate the flight tuning across four kinds and require guarding the shared limits against use by ground motion.
- Store boost in the vehicle aggregate and pass it as a tick flag. That would put a flight-specific state in the kind-neutral core and expose it to drives without flight.
- Add a cab monitor tool. That would tie a transient switch to a persistent equipment state and require monitor displays and art for the SUV, camper and scooter.

## Consequences

- Boost stays in memory and needs no saved properties, restoration rules or cab monitor display.
- The existing ram formulas still scale damage and push with speed, so a ram near boosted top speed deals about three times the damage and push. The exact push also includes the existing fixed component.
