# Camper

| Front left | Side |
|:---:|:---:|
| ![The camper seen from its front-left corner](../images/camper-front-left.png) | ![The camper seen from the side](../images/camper-side.png) |

A four-seat camper with a facing dinette that drives, flies, and dives. Back to the [README](../../README.md).

## Getting one

- Combine an SUV item, a bed, a chest, and an oak door at a crafting table
- The camper is not given as a starter item
- Use the item on a block's top face with 9 x 9 x 4 clear cells around it
- Each player keeps one camper; placing another removes their previous camper
- Hit the front bumper of an empty camper 3 times without a dye to break it back into the item; the bumper is the only part that takes hits, so you also get in and paint there

## Controls

Use the same controls as the SUV: see the [SUV controls table](suv.md#controls). Seat 0 is the front-right driver, as in the SUV; seats 2 and 3 face each other at the dinette on the left.

## How it moves

The camper has the SUV's ground top speed of 0.9 blocks per tick, with gentler acceleration (about 3.75 s to top speed) and slower turns for its long body. It flies and dives with the same controls as the SUV. Its long body stops at a wall at both the front and the rear bumper, even a one-block pillar or a one-block-thick wall at top speed, and it still climbs one-block steps without hopping in place at a wall. Flying or diving, it stops before the nose enters any block, low ones included.

The 16 dyes recolor the window band, the stripe with its W, and the lower skirt, leaving the white body unchanged. Headlights light the road up to 27 blocks ahead.

## Parking

Stop on flat ground and leave the controls alone for a second: the camper parks. It turns to the nearest quarter turn and you can walk inside, sit at the dinette, and place blocks on the floor and the roof. Tap the door from either side to open or close it. The bed at the rear left is solid: you can stand on it, but not walk through it. Along the right side stand a tall shelf behind the driver's seat, a counter with a stove and a sink behind the door, a wall cabinet above the counter, and a shower-toilet room in the rear corner, and a small hook hangs from the ceiling above the table. Only the model draws them, so you can walk through them, and the shower-toilet door stays closed.

Parking checks the room, the interior, the space above the roof, and the feet and head space outside the door: 168 cells. Air and headlight light blocks are allowed. Listed grass, flowers and snow layers are cleared from the top down, including a matching tall plant root under a wall. Anything else, including an unloaded cell or a slab under the camper, keeps it from parking and the driver sees "Can't park here".

Dirt paths, farmland, mud and soul sand, which are lower than a full block, support parking: when the feet are within 0.15 blocks below the next cell boundary, the floor and body snap up to that boundary. Otherwise they snap to `floor(y + 0.01)`, so lower snow layers can be cleared. The room and seats stay aligned with the body. A full floor block above a dirt path or farmland turns it into dirt, as any full block does.

To drive off, sit in the driver's seat and push forward or back. Anyone standing inside or on the full roof, including its wall plates and up to 0.3 blocks beyond the edge, is seated if a seat is free. Players without a seat move outside the door if its exit is clear; if either exit cell is blocked, they stay where they are while the camper departs. The departure check reads the 61 interior and roof cells outside the bed and the two exit cells in one batch. While a block you placed is inside or on the roof, the camper stays parked and asks you to clear it first.

After a reload, a parked camper keeps its room and the door continues toward the target saved in its door blocks. If the reload interrupted parking before the room was laid, it checks and clears decorations once, then lays the room that tick. Any newly occupied cells are preserved and skipped; this recovery does not scan again every tick.

## Sleeping

Long-press or use the bed at the rear left of a parked camper to set your spawn point there. At night (time of day 12542 to 23459), your screen fades to black and the night is skipped to the morning for everyone. At other times you see "You can sleep only at night". The bed works only in the Overworld. If the camper drives away, you still respawn where it was parked.

## Decorating

While the camper is parked, hold a camping gear item and long-press or right-click anywhere inside it. The item goes to the free spot nearest the point you pressed, among the spots that accept it: the dashboard, the table, the dinette seats, the shelf, the stove, the counter, the wall cabinet, and the ceiling hook above the table. Items that stand on the shelf also fit on the wall cabinet. If every spot for that item is taken, you see "No free spot for this item" and keep the item. Placing takes the item from your hand, except in Creative. Long-press or right-click a placed item with an empty hand to take it back into your inventory; if your inventory is full, it drops at your feet. Placed items stay through driving and reloads. When you break the camper back into its item, every placed item comes back to you the same way.
