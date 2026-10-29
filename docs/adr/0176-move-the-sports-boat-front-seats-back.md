# 0176. Move the sports boat's front seats back

- Status: Accepted
- Date: 2026-10-29
- Extends: [0051](0051-sports-boat.md), [0058](0058-refine-the-sports-boat-interior.md), [0117](0117-move-the-suv-front-seats-back.md)
- Supersedes in part: [0117](0117-move-the-suv-front-seats-back.md) (its last bullet: "The sports boat keeps its own seat positions at z = 0.35")

## Context

The owner finds the Sports Boat driver sits too far forward and asks for the driver and the front passenger to sit a little further back.

The boat has no `seat_*` bones; a rider's position is only `minecraft:rideable.seats` in `sportsboat.se.json`, repeated in `SPORTSBOAT_PROFILE.seats.positions` and in the test pack's `boat_seat_probe.se.json` (0019). The front seats were at z = 0.35 blocks, so the rider sat at 5.6 px, exactly at the front edge of the drawn bucket cushion.

The steering wheel is centred at `WZ = 7.0` with a tilt of -30 degrees (0166). Its rim's rearmost point is at about 5.48 px. A player's torso is 4 px deep around the rider (0170), so the driver's torso front was at 7.6 px, about 2 px inside the wheel. That overlap is why the driver looks too far forward.

0117 and 0170 moved the SUV's front seats back and left the boat alone. The boat needs the same treatment, per kind (0050).

## Decision

1. Move the two front riders 3 px = 0.1875 blocks toward the stern: seats 0 and 1 go from z = 0.35 to z = 0.1625 in `sportsboat.se.json`, `SPORTSBOAT_PROFILE` and `boat_seat_probe.se.json`. x and y stay. Seats 2 and 3 stay at z = -0.8. The SUV, the camper and `seat_probe` are untouched.
2. Move the two drawn front buckets with their riders. In `tools/gen_sportsboat.py`, `HELM_SEAT_SHIFT = -3.0` px is added to every z of the pedestal, shells, cushion, bolster, backrest, headrest, wings and arms. Sizes, x, y, colors and cube order do not change, so the cube count and the index-based model tests stay valid. The rider stays 3.6 px ahead of the backrest face, as before; moving only the rider would put its back inside the back shell.
3. Keep the wheel, the column cowl, the consoles, the display, the tan side wall panels, the mirror, the windshield and the aft lounge where they are. The wheel is the fixed reference (0166, 0170). The gap between the bolster front and the console grows from 1 px to 4 px; that is intended.
4. Three px is the largest step that keeps the rear passengers' space acceptable and clears the wheel: the driver's torso front is at 4.6 px, about 0.9 px behind the wheel's rearmost point. The gap between a rear rider's torso and the bucket back drops from 10.8 px to 7.8 px, and the rear cushion's front edge stays 6 px from the bucket back, so a rear rider's knees still fit.
5. A model test asserts that every wheel cube is at least 0.5 px ahead of the driver's torso front, as 0170 does for the SUV.

## Consequences

- The Resource Pack version goes up (0015), and the entity change needs a server restart, not `/reload`.
- `seatAimHeight` (0.52) and `seatAimRadius` (0.38) do not change: the left-right distance of the seats is unchanged, and the front-to-rear distance grows from 1.15 to 1.3125 blocks.
- The monitor assets are derived from seat 0 by `pnpm model`; they are regenerated and, if their output does not change, stay byte-identical.
- Manual row H12 checks the driver, the front passenger and a rear passenger on PC and mobile.
