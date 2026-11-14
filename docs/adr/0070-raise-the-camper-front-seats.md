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
- The model retains the 6.4 px rise of both front seats and the raised cushion level with a pan base at 24.4 px and a dished top near 27.9 px. Each cab bucket has 501 cubes: tangent patches form the rounded back and waterfall cushion, with piping, three swivel plates, a narrow column, recliners, and a lap belt. Two fully enclosed piping strips are omitted. The exposed lap span clears the upholstery; its outboard attachment meets the lower bolster and piping. Rider anchors, head room, and the four-seat profile stay unchanged
- Register the shared 333 by 128 tweed/vinyl slab as `green tweed and vinyl shared by both seats`. It contains two 128 by 128 wale panels, a 64 by 64 vinyl panel, and thirteen one-texel swatches. Use FABRIC for the primary region and separate VINYL regions for the vinyl panel and six vinyl/piping swatches. Declare the seats' 464 compound-rotated patches as the `cab_seats` assembly
- The steering wheel moves 4 px up and lies back at 65 degrees instead of 50, like a bus wheel, so its lower rim clears the raised cushion and its upper rim stays under the driver's view of the windshield's lower frame. Its longer column still reaches the dashboard; that length and the steering bone's pivot and 65-degree lean are retained when the dashboard is replaced by the sloped assembly in 0106. That assembly exposes `DASH_GEOMETRY.column_entry` for checking the existing column against the new body
- The parked camper's front deck seats rise 0.98 above the pose instead of 0.58 (the rideable height minus the deck seat's 0.52), so they keep matching the vehicle seats

## Consequences

- The driver and the front passenger look over the dashboard through the windshield
- The eye height of a seated player cannot be read from a script, so whether the view clears the frame is checked by hand
- The dashboard replacement does not implement the later reference wheel, column or gear lever. Those changes require their own geometry and clearance verification; the seat heights and steering contract above remain in force
