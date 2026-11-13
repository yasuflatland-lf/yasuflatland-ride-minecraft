# 0070. Raise the camper's front seats

- Status: Accepted
- Date: 2026-10-20
- Supersedes in part: [0068](0068-park-the-camper-with-room-blocks.md): the front deck seat rise
- Supersedes in part: [0069](0069-camper-right-hand-drive.md): the front seat heights

## Context

0069 kept the camper's seat heights, with both front seats of `minecraft:rideable` at 1.1. From there the owner could not see out of the driver's seat: the padded dashboard tops out at 28.6 px and the windshield's lower frame is at 36 px, and a seated player's eyes stayed below that frame.

## Decision

This supersedes the seat height part of 0069's first bullet and the front deck seat rise of 0068.

- Both front seats of `minecraft:rideable` sit at 1.5 instead of 1.1, 0.4 blocks higher. The dinette seats stay at 1.2
- The model raises both front bucket seats by the same 6.4 px on a taller pedestal, so the riders still sit on the cushions
- The steering wheel moves 4 px up and lies back at 65 degrees instead of 50, like a bus wheel, so its lower rim clears the raised cushion and its upper rim stays under the driver's view of the windshield's lower frame. Its column retains this length and the steering bone retains its pivot and 65-degree lean when the dashboard is replaced by the sloped assembly in 0106. That assembly exposes `DASH_GEOMETRY.column_entry` for checking the existing column against the new body
- The parked camper's front deck seats rise 0.98 above the pose instead of 0.58 (the rideable height minus the deck seat's 0.52), so they keep matching the vehicle seats

## Consequences

- The driver and the front passenger look over the dashboard through the windshield
- The eye height of a seated player cannot be read from a script, so whether the view clears the frame is checked by hand
- The dashboard replacement does not implement the later reference wheel, column, gear lever or rounded seats. Those changes require their own geometry and clearance verification; the seat heights and steering contract above remain in force
