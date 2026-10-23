# 0128. Settle every crew's seats by the rider list

- Status: Accepted
- Date: 2026-10-23
- Supersedes in part: [0019](0019-passengers-move-up-to-the-driver-seat.md) (seat readings and door events), [0025](0025-jump-on-touch-and-a-sticky-driver.md) (sticky drivers with an index), [0126](0126-choose-a-new-driver-with-one-tick-of-motion.md) (occupancy and restore readings)
- Extends: [0120](0120-choose-a-sports-boat-seat-by-aiming-at-it.md) (index readings for every kind), [0055](0055-kind-neutral-vehicle-core.md) (crew ownership)

## Context

Issue #484 found that independently reading each rider's nearest seat can name the same seat twice. The SUV's seats 0 and 2 are one block apart on the same side. A front rider lagging behind a moving vehicle can read as seat 2 alongside its passenger. Seat 0 then appears free to deck-seat inputs and dock layout, and leaving after that reading plays the rear door. 0025 measured a one-tick offset jump of about 0.5 blocks; 0019 measured up to 5 ticks for the engine to move a passenger forward.

The infrastructure already provides every player's index in the unfiltered engine rider list. That index is the seat the engine assigns (0019), and unlike the position it does not lag. 0120 uses it for the sports boat. 0126 corrects driver selection using one tick of horizontal motion, but explicitly leaves occupancy and doors based on raw offsets.

Vehicle also wires seating, chosen seats, deck holds, and the 6-tick driver handover wait separately. These form one concept: the crew. Extracting Crew first lets the existing tests verify the move independently of the seating fix.

## Decision

- Crew owns Seating, optional ChosenSeats, seat requests in local coordinates, deck-seat holds and departure requests, and the driver handover timer of 0078. Vehicle keeps world-to-local aim conversion, drive-dependent deck input masking and docking, and command ordering. Crew receives the horizontal world-space step for Seating's driver selection (0126).
- For every kind, read a rider's seat from their slot when defined and below the seat count; otherwise use their nearest seat in local coordinates.
- Settle riders in a fixed order: readings matching the rider's previous settled seat first, then ascending slot with undefined last, then input order. Each takes their reading when free, otherwise their previous seat when free, otherwise the free seat nearest their position. Distance ties go to the lower seat index. A rider beyond capacity remains unseated. Taken seats come from this unique settlement.
- A departing rider vacates their previous settled seat. Report these seats ascending, and never report a rider who remains aboard as vacating a seat. Drives continue to turn those seats into door commands, applied in finalCommands (0055).
- Keep the current driver if they remain aboard without a slot (0025). Otherwise use the indexed rider settled in DRIVER_SEAT. For position-only riders, retain 0126: choose the closest rider to DRIVER_SEAT, ties by input order, and accept only if their raw position or position plus one tick of motion reads as that seat. Do not choose a position-only driver merely because collision settlement assigned them DRIVER_SEAT.
- Restore uses the same settlement and driver selection with zero motion, so the next identical update reports no newly mounted driver. Mounted still means a defined driver different from the previous driver.
- Keep ChosenSeats, chosen layouts (0120), profiles, drive behavior, the handover interval, and infrastructure unchanged. Riders with slots hand over on the tick the engine shifts the list, without waiting for their positions.

## Consequences

The SUV and camper retain their occupied front seats under lag, and a departing front rider plays the front door. Slot-less snapshots and tests retain sticky drivers and the motion allowance of 0126, while collision settlement also makes their occupancy unique.

Settlement resolves inconsistent or duplicate readings deterministically, but a position-only collision can assign a rider a seat different from their raw nearest seat. Extra riders beyond capacity have no seat and produce no door when leaving; the engine's rideable capacity normally prevents this. Revisit if the engine stops assigning seats by rider-list index or introduces a stable seat identifier.

Properties cover both the SUV and camper, arbitrary readings over sequences, shared lag of up to 1.5 blocks on each horizontal axis, departing subsets, driver changes, restore, and position-only collisions. The K5 examples fail before the settlement change and pass afterward. No pack or infrastructure changes are required.
