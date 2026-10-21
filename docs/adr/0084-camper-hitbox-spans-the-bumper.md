# 0084. The camper hitbox spans the whole front bumper

- Status: Extended by [0086](0086-camper-hints-near-the-bumper-and-the-parked-driver-seat.md)
- Date: 2026-10-20
- Supersedes in part: 0068 (the single 1 x 1 x 1 bumper hitbox)

## Context

0068 gave the camper one 1 x 1 x 1 hitbox centered on the front bumper, so that taps inside the parked body reach the room blocks instead of the camper. Players get in, hit the camper back into its item, and paint it only through that box. The bumper is 3 blocks wide, but the box covers only its middle block, so the owner hit the bumper beside it with a dye and could not repaint the camper.

A `minecraft:custom_hit_test` hitbox has one `width` for both x and z. A single box 3 blocks wide would also reach 1.5 blocks into the body and take taps meant for the front row of room cells.

## Decision

- The camper has three 1 x 1 x 1 hitboxes side by side at x -1, 0, and 1, each at y 0.5 and z 3.7 (the front end, `CAMPER_SPEC.bodyFront`). Together they cover the whole bumper, 1 block high, and still reach only half a block into the body, as the single box of 0068 did
- Everything else in 0068 stays: the boxes are set from spawn in every form, and the base components keep the 3 x 4 collision box that hitboxes need

## Consequences

- Getting in, hitting the camper back into its item, and painting it work anywhere along the bumper
- A block placed right in front of the bumper, up to 1 block high, can be harder to hit, because the boxes stick out half a block past the bumper across its whole width instead of only its middle
- Check on a phone that taps reach the side boxes, as 0068's phone tests found engine limits the desktop did not show. If they do not, revert to the single box
