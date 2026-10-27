# 0117. Move the SUV's front seats back

- Status: Superseded in part by 0170
- Date: 2026-10-22
- Supersedes in part: 0052 (the front seats' z in its seat table)

## Context

The owner asked for the SUV's driver's seat and front passenger seat to sit a little farther back (#450). The front riders sat at z = 0.35 blocks (5.6 px ahead of the model's origin) and the drawn front seats had their backrest at z = 0 px, so a front rider sat 5.6 px ahead of the seat's back. On the rear bench the riders sit at z = -0.8 blocks (-12.8 px) with the backrest at -18 px, 5.2 px ahead of it, which looks right in game. The rear bench's front edge is at -8.6 px and the B-pillar at -6 px, so the front seats have room to move back.

## Decision

- The two front riders of the SUV move from z = 0.35 to z = 0.2 blocks (2.4 px back) in `minecraft:rideable` of `suv.se.json` and in `SUV_PROFILE.seats.positions`. x and y stay. The test pack's `yasu_ride_test:seat_probe` copies the change, as 0019 requires. The rear seats stay at z = -0.8
- The drawn front seats and the `seat_0` and `seat_1` bones move 2 px back (`FRONT_SEAT_Z = -2` in `tools/gen_model.py`), so a front rider sits 5.2 px ahead of the seat's back, as on the rear bench
- The sports boat keeps its own seat positions at z = 0.35 (0050, 0051)

## Consequences

- The front riders sit farther from the dashboard and the steering wheel. The backrest of the front seats is still 6.6 px ahead of the rear bench's front edge and 3 px ahead of the B-pillar, inside the front doors' span
- Seat matching by the nearest seat (0019, 0052) still tells the rows apart: the rows are now 1 block apart instead of 1.15
- Revisit the offset if riders look as though they sink into the backrest in game
