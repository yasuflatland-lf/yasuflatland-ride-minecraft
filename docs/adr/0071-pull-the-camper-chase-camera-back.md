# 0071. Pull the camper's chase camera back

- Status: Accepted
- Date: 2026-10-20
- Supersedes in part: 0028 (the one camera preset for every vehicle)

## Context

0028 switches riders to the vanilla `minecraft:third_person` preset in every form but `car` (0039). That view sits a few blocks behind the player. It frames the SUV, but the camper's body runs 7.6 blocks with the bumper and ladder, and its front seats sit 2.1 blocks ahead of its center. The owner flew the camper and found the view still inside the body.

The stable Script API cannot set the distance of `minecraft:third_person`. A behavior pack camera preset can: one that inherits from `minecraft:follow_orbit` takes a `radius` in blocks, and that preset has needed no experimental toggle since 1.21.40, below the pack's minimum engine version of 1.21.80 (0001).

## Decision

- Each vehicle profile names its chase camera, `near` or `far`, the way it holds its other per-kind values (0050). The SUV and the sports boat keep `near`; the camper uses `far`
- `near` sets `minecraft:third_person`, as before. `far` sets the pack's `yasu_ride:far_chase` preset in `cameras/presets/yasu_ride/far_chase.json`, which inherits from `minecraft:follow_orbit` with a radius of 12 blocks, enough to frame the whole camper from the front seats
- `DriveVehicles` remembers which chase camera it set for each player and switches a rider again when the camera their vehicle wants changes, for example a rider who moves from a flying SUV to a flying camper. Getting off, landing, and the retry and log rules stay as 0028 and 0052 set them

## Consequences

- The camper's riders see the whole camper in flight and under water
- `follow_orbit` turns around the player as they look around, like the vanilla third-person view; how it handles blocks between the camera and the player is the engine's and is checked by hand
- The camera cannot be observed from a script, so there is no in-game test for it (0028); manual row C25 checks it on PC and mobile
