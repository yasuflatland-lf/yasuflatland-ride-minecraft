# 0078. Wait for a passenger to move up before landing a driverless flying vehicle

- Status: Accepted
- Date: 2026-10-20
- Supersedes in part: 0021 (a flying vehicle without a driver lands at once, when riders remain), 0040 (what counts as controlled)

## Context

0021 lands a flying vehicle at once when it has neither a driver nor test input, and the form table of 0040 sends `hover` to `landing` whenever the vehicle is uncontrolled, where controlled means a driver or test input is present. 0019 measured on BDS that when the driver gets out, Bedrock moves the next passenger into the driver seat (seat 0) within 5 ticks, and that passenger becomes the driver. During those ticks no rider reads as seat 0, so the core has no driver and the vehicle started landing on the first of them. Landing cannot be cancelled: takeoff and landing ignore Jump, and landing only returns to the ground form when the vehicle touches the ground (0021, and the `landing` row of the 0040 table). The passenger who moved up could not keep the vehicle in the air.

0025 already keeps a driver who is still aboard from being dropped by a one-tick misread of their seat. It does not cover this case, because the old driver has really left.

## Decision

- The core counts the ticks since the last tick with a driver. While no rider is in seat 0 but at least one rider is aboard, it waits `SPEC.driverHandoverTicks` = 6 ticks (the 5 ticks measured in 0019 plus one) before it treats the vehicle as driverless
- While it waits, the drive runs with neutral input but counts as controlled: a hovering vehicle holds its altitude and does not start landing, and a submerged one does not float up. In the terms of 0040, controlled now means a driver, test input, or this wait
- When a rider reaches seat 0 within the wait, they become the driver as in 0019 and 0025 and fly on. Otherwise landing starts on the 7th tick after the last driver tick
- A vehicle with no riders still lands at once (0021). A vehicle rebuilt after `/reload` with riders but nobody in seat 0 gets no wait, because the core cannot tell when its driver left
- The wait lives in the kind-neutral core (`Vehicle`) and reaches the drive through `TickContext.awaitingDriver`; only drives that fly (`TransformingDrive`, used by the SUV and the camper) read it

## Consequences

- The wheel can be handed over in flight: the driver gets out and the passenger who moves up keeps flying, as on the ground (0019)
- A vehicle whose last rider is a passenger who never reaches seat 0 hovers up to 6 ticks (0.3 s) longer before it lands
- The heading rule for a new driver does not change: `onDriverMounted` turns the vehicle to the driver's view only when it is nearly stopped (0007 and 0019), and the camper never turns while parked. A passenger who moves up while the vehicle is still moving keeps the current heading, in the air as on the ground
- The 6 ticks rest on the 5-tick move-up measured in 0019. The in-game test `seats_after_driver_leaves` fails if the move-up takes longer than 5 ticks, but it does not measure how long it takes. Revisit the value if that test starts failing on a later Bedrock version
