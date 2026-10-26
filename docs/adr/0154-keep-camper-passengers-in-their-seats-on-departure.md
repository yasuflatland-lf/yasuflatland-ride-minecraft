# 0154. Keep camper passengers in their seats on departure

- Status: Proposed
- Date: 2026-10-26
- Extends: 0120, 0063, 0068, 0095, 0050

## Context

The owner wants a person sitting in a dinette seat of the camper (vehicle seats 2 and 3) to stay there when the camper sets off, so nobody has to get out and back in at every stop. Reading the code shows that no condition stops the camper from departing while a rear seat is occupied: `CamperDrive.step` never reads seat occupancy, and riders already come along. What goes wrong is where they sit afterwards. A deck-seat rider is added to the camper's rider list at the next free index, and the engine seats riders by rider-list index (0019), so a lone dinette passenger lands in the front passenger seat.

The sports boat solved the same problem with chosen seats and invisible seat fillers (0120). The camper kept the engine's order because its profile said `boarding: { order: "engine" }`, its `minecraft:rideable` accepted only players, and its bumper stand-in (0116) boarded players with `addRider` directly, so no seat could be chosen.

## Decision

Apply the mechanism of 0120 to the camper through the per-kind profile (0050) and leave the shared logic alone.

- The camper's `boarding` becomes `"chosen"` with `CAMPER_SPEC.seatAimHeight` of 1.35 and `CAMPER_SPEC.seatAimRadius` of 0.5. The height lies between the front seats at 1.5 and the dinette seats at 1.2 in `camper.se.json`, because the aim ball is measured at one height. The radius is below half of the smallest gap between two seats, hypot(0.25, 1.1) = 1.128 between seats 1 and 2, so aim balls never overlap.
- On departure `Crew.layout` gives each rider of deck seats 0 to 3 the vehicle seat of the same index, and fillers hold the empty seats below a taken one. The toilet rider (deck seat 4) is not part of the layout; `boardDeckRiders` adds them afterwards if a seat is free, and they are moved to the exit otherwise (0095).
- The camper's `minecraft:rideable` accepts the seat filler family, as the sports boat's does.
- The bumper stand-in boards through `BoardVehicle` first, so a player on foot takes the seat they aim at or, on touch, the nearest free one, including seat 0 while rear seats are held. When `BoardVehicle` declines, the stand-in falls back to `addRider` on the next tick, as before.

Letting the rider of a rear deck seat start the camper stays out of scope: departure is still driven by the seat 0 stick (0063).

## Consequences

- A rear rider no longer moves up to seat 0 when the driver gets out while driving; only the seat 1 rider does (0120). A camper with only rear riders has no driver until a player presses the bumper and takes seat 0.
- Standing players inside or on the roof (0068) are refused when riders and fillers fill all four rider-list slots, and are then handled like a player standing inside a full camper.
- Up to three extra filler entities exist while rear seats are held. None remains after the camper is broken, removed or unloaded.
- This is a Behavior Pack change only: existing worlds need a server restart, and no Resource Pack version bump is needed.
- 0120 is still Proposed pending phone checks. Whether BDS accepts the filler as a rider of the camper's rideable, and how the two seat heights affect aiming, can only be confirmed in a play test on PC and phone. If the check fails, revisit the two aim values rather than adding a workaround in shared logic.
