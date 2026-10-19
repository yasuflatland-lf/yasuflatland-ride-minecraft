# 0069. Seat the camper's driver on the right like the SUV

- Status: Accepted
- Date: 2026-10-20

## Context

0067 put the camper's driver at the front left (left-hand drive), as in the owner's photos of the 1972 motorhome. The SUV is right-hand drive: its seat 0 sits at x = -0.38 with x = left. When the owner got into the camper, they ended up on the right and asked for the camper's driver seat to be on the right too, so both vehicles drive from the same side.

The camper's entry door is in the middle of its right side, and the facing dinette (seats 2 and 3) fills the left side behind the front seats. A dinette on the right would run into the door opening.

## Decision

This supersedes the seat bullet of 0067; the rest of 0067 stands.

- Seat 0, the driver, sits at the front right, `{ x: -0.75, z: 2.1 }` (x = left, z = forward), and seat 1, the front passenger, at the front left, `{ x: 0.75, z: 2.1 }`. `minecraft:rideable` keeps the same seat order, heights, and seat 0's `lock_rider_rotation` (0019)
- Seats 2 and 3 stay a facing dinette on the left, now behind the passenger, at `{ x: 1.0, z: 1.0 }` and `{ x: 1.0, z: -1.0 }`, seat 2 facing the rear, because the door stays in the middle of the right side
- The model moves every driver-side part to the right: the steering wheel and its column, the two gauges, the pedals, and the driver's bucket seat. The radio and the glovebox move to the passenger side on the left, so the radio does not sit behind the wheel. The wheel's own shape, the center switches, and the parts on both sides stay as they were
- The parked camper's deck seats follow the profile, so the driver's deck seat moves to the front right with seat 0, and a driver who pushes the stick there still moves into seat 0 and drives off (0068)

## Consequences

- The camper and the SUV drive from the same side, so a player sits where they expect in either vehicle
- The camper no longer matches the owner's left-hand-drive photos inside the cab. The outside does not change
- The driver's seat is now on the door's side, so a driver who leaves the parked camper walks a shorter way to the door
