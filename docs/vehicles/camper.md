# Camper

| Front left | Side |
|:---:|:---:|
| ![The camper seen from its front-left corner](../images/camper-front-left.png) | ![The camper seen from the side](../images/camper-side.png) |

A four-seat camper with a facing dinette that drives, flies, and dives. Back to the [README](../../README.md).

## Getting one

- Combine an SUV item, a bed, a chest, and an oak door at a crafting table
- The camper is not given as a starter item
- Use the item on a block's top face with 9 x 9 x 4 clear cells around it
- The first time you place a camper, you also get a Camping Gear Box; use it to unpack the 19 [camping gear](../items/camping-gear.md) items
- Each player keeps one camper; placing another removes their previous camper
- Hit the front bumper of an empty camper 3 times without a dye to break it back into the item; the bumper is the only part that takes hits, so you also get in and paint there

## Controls

Use the same controls as the SUV: see the [SUV controls table](suv.md#controls). Seat 0 is the front-right driver, as in the SUV; seats 2 and 3 face each other at the dinette on the left.

## How it moves

The camper has the SUV's ground top speed of 0.9 blocks per tick, with gentler acceleration (about 3.75 s to top speed) and slower turns for its long body. It flies and dives with the same controls as the SUV. Its long body stops at a wall at both the front and the rear bumper, even a one-block pillar or a one-block-thick wall at top speed, and it still climbs one-block steps without hopping in place at a wall. Flying or diving, it stops before the nose enters any block, low ones included.

The 16 dyes recolor the window band, the stripe with its W, and the lower skirt, leaving the white body unchanged. Headlights light the road up to 27 blocks ahead.

## Parking

Stop on flat ground and leave the controls alone for a second: the camper parks. It turns to the nearest quarter turn and you can walk inside, sit at the dinette, and place blocks on the floor and the roof. Tap the door from either side to open or close it. The bed at the rear left is solid: you can stand on it, but not walk through it. Along the right side stand a tall shelf behind the driver's seat, a counter with a stove and a sink behind the door, a wall cabinet above the counter, and a shower-toilet room in the rear corner, and a small hook hangs from the ceiling above the table. Only the model draws them, so you can walk through them; see [Shower](#shower) for opening the shower-toilet door.

Parking checks the room, the interior, the space above the roof, and the feet and head space outside the door: 168 cells. Air and headlight light blocks are allowed. Listed grass, flowers and snow layers are cleared from the top down, including a matching tall plant root under a wall. Anything else, including an unloaded cell or a slab under the camper, keeps it from parking and the driver sees "Can't park here".

Dirt paths, farmland, mud and soul sand, which are lower than a full block, support parking: when the feet are within 0.15 blocks below the next cell boundary, the floor and body snap up to that boundary. Otherwise they snap to `floor(y + 0.01)`, so lower snow layers can be cleared. The room and seats stay aligned with the body. A full floor block above a dirt path or farmland turns it into dirt, as any full block does.

To drive off, sit in the driver's seat and push forward or back. Anyone standing inside or on the full roof, including its wall plates and up to 0.3 blocks beyond the edge, is seated if a seat is free. Players without a seat move outside the door if its exit is clear; if either exit cell is blocked, they stay where they are while the camper departs. The departure check reads the 47 interior and roof cells outside the bed, the shower-toilet, and the decor spots, the 12 decor spots, and the two exit cells in one batch. A decor spot may hold only its own item or nothing. While a block you placed is inside or on the roof, the camper stays parked and asks you to clear it first.

The room, the bed, the door step, and placed camping gear cannot be broken, not even in Creative. Take camping gear back with an empty-hand long-press as described under [Decorating](#decorating). If a command such as `/fill` removes part of the room while the camper is parked, the camper puts it back within a second. A block you put in such a gap first stays yours.

After a reload, a parked camper keeps its room and the door continues toward the target saved in its door blocks. If the reload interrupted parking before the room was laid, it checks and clears decorations once, then lays the room that tick. Any newly occupied cells are preserved and skipped; this recovery does not scan again every tick.

## Sleeping

Long-press or use the bed at the rear left of a parked camper to set your spawn point there. At night (time of day 12542 to 23459), your screen fades to black and the night is skipped to the morning for everyone. At other times you see "You can sleep only at night". The bed works only in the Overworld. If the camper drives away, you still respawn where it was parked.

## Decorating

While the camper is parked, hold a camping gear item and long-press or right-click a spot that takes decor: the dashboard, the table, the dinette seats, the shelf, the stove, the counter, the wall cabinet, or the ceiling hook above the table. You can press it from anywhere inside, including from a seat. Once a spot holds an item, press the item itself: the rest of that spot's top no longer catches the press. Any standing item fits any spot except the ceiling hook, which takes only the hanging planter. The item goes on the spot you pressed if it is free; otherwise it goes to the free spot nearest the point you pressed. To put an item on a dinette seat, hold it and press the seat; with an empty hand you sit down. If every spot for that item is taken, you see "No free spot for this item" and keep the item. Placing takes the item from your hand, except in Creative. Long-press or right-click a placed item with an empty hand to take it back into your inventory; if your inventory is full, it drops at your feet. Placed items stay through driving and reloads. When you break the camper back into its item, every placed item comes back to you the same way. Holding a block while pressing a spot places that block in the room next to the spot, and the camper asks you to clear it before it drives off.

## Shower

The shower-toilet at the rear right of a parked camper has its own door. With an empty hand, long-press (or right-click) the shower-toilet door from the aisle to open or close it; anywhere on the door works, even aimed low at the toilet behind it. Step inside, turn back toward the door, and long-press it with an empty hand to run the shower: water sprays from the shower head with the sound of running water for 5 seconds, and another long-press starts the 5 seconds over. Driving away shuts the door and stops the shower.

## Toilet

While the camper is parked, long-press or use the toilet in the shower-toilet at the rear right to sit on it, and sneak to stand up. From inside, long-press the toilet itself to sit; long-pressing the door side runs the shower instead. When the driver sets off, a player on the toilet moves into a free seat. If every seat is taken, they move outside the door like a player left standing, or stay standing inside if the way out is blocked.
