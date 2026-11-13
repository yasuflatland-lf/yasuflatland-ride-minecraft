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
- The steering assembly is built by `tools/camper_steering.py` using `DASH_GEOMETRY`. The wheel has outer diameter 12.64 px (0.8 scale), a plane 30 degrees above horizontal facing up and toward the driver, and a column rising toward the driver at 60 degrees above the floor, perpendicular within 0.1 degrees. The rim vertical axis projects vertically within 2 degrees when viewed along the column. The 115-cube wheel has static bone pivot (-14.29, 38.4909, -42.8) and rotation [60, 0, 0], with no steering animation. The dark-dash shaft and steel sleeve stay on `body`; compound assemblies follow 0167. The column reaches the firewall beneath the dash and has a lower sleeve. The rim clears the dash face by 1.5 px, the cushion by 1 px, and the side wall by 0.6 px. The 30-cube gear lever is a static `body` assembly, at least 0.3 px clear of the wheel and dash, with 5.46 px horizontal and 4.70 px rising rods (36.56 degrees) and a double-size black knob.
- The parked camper's front deck seats rise 0.98 above the pose instead of 0.58 (the rideable height minus the deck seat's 0.52), so they keep matching the vehicle seats

## Consequences

- The raised seats retain their existing eye-height intent; the new wheel extends above the sill, so first-person windshield visibility still needs a device check
- The eye height of a seated player cannot be read from a script, so whether the view clears the frame is checked by hand
- Rounded seats remain separate work. Geometry tests cover wheel, column and lever clearances without changing rider positions or cushion height
