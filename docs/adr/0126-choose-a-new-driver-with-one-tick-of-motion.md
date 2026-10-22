# 0126. Choose a new driver with one tick of motion

- Status: Accepted
- Date: 2026-10-23
- Amends: [0019](0019-passengers-move-up-to-the-driver-seat.md), [0025](0025-jump-on-touch-and-a-sticky-driver.md) (choosing a driver when no sticky driver remains)

## Context

0019 and 0025 choose a new driver as the rider closest to seat 0. The implementation instead chose the first rider whose nearest seat was 0. A rider's position can lag a moving vehicle by one tick: 0025 measured an offset jump of about 0.5 blocks. The SUV and camper can move 0.9 blocks per tick. The SUV's seat 0 is at (-0.38, 0.2) and seat 2 at (-0.38, -0.8), so a driver reading more than 0.5 blocks behind reads as seat 2.

During handover, the old driver has left and the next passenger can keep reading behind seat 0 while moving. No driver is selected, and after the 6 handover ticks of 0078 a hovering vehicle starts an irreversible landing (0021).

Choosing the closest rider unconditionally would remove the at-rest state where passengers remain but nobody sits in seat 0. That state is required by 0078's handover wait and landing. Position alone cannot distinguish a passenger in seat 2 at rest from a seat-0 rider lagging one block. Horizontal engine velocity supplies a bound on one tick of lag.

## Decision

- Keep the sticky driver of 0025 first for position readings: a driver who remains aboard keeps driving.
- When no sticky driver remains, choose the rider closest to seat 0 in the vehicle's local coordinates (0019, 0025). Scan once and replace the candidate only for a strictly smaller distance, so ties go to the earlier rider in the list. An empty rider list has no driver.
- Accept that candidate only when their raw reading's nearest seat is 0, or when their reading plus one tick of the vehicle's horizontal motion has nearest seat 0. Otherwise there is no driver; do not try a different candidate.
- `Seating.update` receives the horizontal world-space step in blocks. `Vehicle.tick` supplies the x and z of its engine velocity sensor in blocks per tick, without deriving motion from the drive's speed or heading.
- Keep occupancy, vacated seats and door events based on raw offsets (0019). Keep `Seating.restore` based on raw nearest-seat readings because it has no velocity; a rebuild with nobody in seat 0 still gets no handover wait (0078).
- Keep the sports boat's slot reading and non-sticky driver selection unchanged (0120). Keep the 6-tick handover wait and all drive tuning unchanged.

## Consequences

- A seat-0 rider with up to one tick of shared backward lag can take over while the vehicle moves, including in flight. At rest, passengers on seats 1-3 still do not drive.
- While moving, a passenger directly behind an empty seat 0 can become the driver a few ticks before the engine moves them up. This is accepted: 0019 measured that the engine moves the next passenger there within 5 ticks anyway.
- The correction only selects the new driver; occupied seats and door events can still reflect lagging positions, and the selected driver stays sticky until leaving (0025).
- Property tests cover the SUV and camper at any yaw with shared forward lag from 0 to 1.2 blocks, reverse lag from 0 to 0.2 blocks, and zero motion. A flight regression covers a 0.6-block lag during handover (0010).
- Revisit if engine readings lag by more than one tick of horizontal motion or riders acquire different lag that defeats the closest-candidate rule. Device behavior remains covered by the existing manual and in-game testing strategy (0010).
