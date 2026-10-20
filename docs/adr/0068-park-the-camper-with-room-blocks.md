# 0068. Park the camper with room blocks

- Status: Accepted (the front deck seat rise is superseded by [0070](0070-raise-the-camper-front-seats.md), and the single bumper hitbox by [0084](0084-camper-hitbox-spans-the-bumper.md); extended by [0086](0086-camper-hints-near-the-bumper-and-the-parked-driver-seat.md))
- Date: 2026-10-19

## Context

The owner wants to walk inside a stopped camper, open and close its door, and place blocks inside it and on its roof, then drive away. An entity's body cannot be walked into, so the parked camper has to be replaced, cell by cell, with invisible blocks the players can stand on and tap, the way the boat lays its deck (0063). The [camper spike](../spike-camper.md) tried this on a phone and found three engine limits, and a later phone test a fourth:

- A `minecraft:custom_hit_test` changed while the game runs never reaches the client, so a hitbox cannot shrink when the camper parks. A hitbox that is small from spawn works, and with only a 1 x 1 x 1 box outside the front bumper every tap inside the body reached a block, even with `minecraft:rideable` and `minecraft:inventory` kept.
- A block cannot be placed where an entity's collision box is, so the parked body's 3 x 4 collision box has to shrink.
- A full floor block placed under a body that still collides pushes it up, and teleports and entity events take effect at the end of the tick.
- An entity's `minecraft:custom_hit_test` hitboxes take taps only while its base components hold a `minecraft:collision_box`; a box set only in component groups is not enough. On a phone, with the box only in groups, no tap reached any camper hitbox, docked or not, and with the box back in the base components three taps broke the camper at the bumper.

## Decision

- A camper parks on its own: in car form, on the ground, below 0.005 blocks/tick for 20 ticks, with the driver's stick within 0.1 (the boat's values, now shared in `motion/dock.ts`). A seated driver does not stop it from parking. It tries once per stop
- Parking snaps the yaw to the nearest 90 degrees and the location to the center of the feet's cell, with the floor layer at the feet's cell: `floor(y + 0.01)`, or `ceil(y - 0.01)` when the feet are within 0.15 below a cell top. A camper on ground lower than a full cube (dirt path and farmland 15/16, mud and soul sand 14/16) still parks on it, its floor in the cell above. Snow layers are decorations, so a camper resting on them at y + n/8 keeps `floor(y + 0.01)` unless within 0.15 of the cell top
- The room is 103 cells in local cells (x left, z forward): a full floor at layer 0 over x -1..1, z -3..3; a ceiling plate at the top of layer 3 over the same cells (2.81 blocks of headroom, a roof top 4.0 blocks up); walls at layers 1-3 around it; a 3-high door in the middle of the right side with a half-high step under it. The blocks are `yasu_ride:camper_floor`, `camper_ceiling`, `camper_wall`, `camper_door`, and the boat's `deck_floor`
- Before parking, the 103 room cells, the 42 interior cells at layers 1-2, the 21 roof cells at layer 4 (the cells departure reads, so a block above the roof refuses parking instead of trapping the camper) and the 2 exit cells (168 cells) must each hold air (light blocks count as air) or a listed passable decoration (grass, ferns, dead bushes, flowers, leaf litter, snow layers). The exit cells are at local x -3, z 0, layers 0 and 1: the feet and head of a player standing on the ground beside the door step. Any other block, liquid, or unloaded cell refuses parking and shows the driver "Can't park here". On success the decorations are removed, top layer first, without drops, and are not put back. A tall plant rooted in a layer-0 cell under the walls, outside the checked floor, loses its bottom half too when its top half is cleared, so nothing drops
- The parking tick only holds the pose and docks the entity: no physics, no gravity, and a 0.4 x 0.4 collision box. The camper keeps its 3 x 4 collision box in its base components; the `yasu_ride:docked` group overrides it with 0.4 x 0.4, and the `yasu_ride:undocked` group sets 3 x 4 again after docking. The room is laid from the next tick
- The camper's only hitbox, in every form and from spawn, is a 1 x 1 x 1 box centered on the front bumper. Players get in, hit it back into its item, and paint it there. This supersedes the three body-long hitboxes of 0067
- Free seats get deck seats at the camper's seat heights. Tapping any door cell opens or closes all three; the drive owns the door's state and swings the `door_entry` bone outward over 10 ticks
- The driver departs by pushing the stick from seat 0; a driver in the driver's deck seat is moved into seat 0 first, as on the boat. If any of the 63 interior and roof cells holds a block, the camper stays parked and shows "Clear the blocks inside first". On departure it seats standing players inside or on the roof, nearest first, moves those left without a seat to the ground outside the door, and clears its room. The 2 exit cells are read in the same batch as the 63 cells; if either holds a block that is not passable, players without a seat are left standing instead of being moved into it. Players count as on the roof inside a box over the whole roof top, the ceiling and wall plates included, plus 0.3 (half a player width) on each side
- After a reload, a parked camper restored before its room was laid redoes the park check and clear; the door's direction follows the open state of the laid door cells, not the swing position

## Consequences

- Parking and departure each cost one batch of block lookups (168 checked cells plus 19 wall-root cells when parking; 65 cells on departure), not a per-tick scan
- A camper parks only on flat, clear ground; a slab under it, or anything a player built where its room goes, refuses it
- From outside, only the bumper reacts to taps
- Blocks placed inside stay in the world until part 4 records them and carries them with the camper; until then they keep the camper parked
