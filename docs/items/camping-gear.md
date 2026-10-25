# Camping gear

Small 1970s motorhome gear made to decorate a parked camper. Back to the [item groups](README.md).

Each item stands in the middle of one slot on the camper's furniture, or at one end of the table or of a compartment behind a door, which hold two items each, except the Macrame Hanging Planter, which hangs from the ceiling hook. On the stove, the slot is the one burner in the middle of its top. A standing item goes on any spot except the ceiling hook: the dashboard, the table, the dinette seats, the stove, the counter, or inside the wall cabinet or the fridge, two behind each door while that door is open (ADR 0114, 0123). The ceiling hook takes only the hanging planter (ADR 0097). Sizes are width × height in pixels, at 16 pixels per block. `pnpm model` draws the previews from the block models it generates from `tools/camping_gear.json`.

| Preview | Name | Size (px) | Stands or hangs | Reference |
|---|---|---|---|---|
| ![Potted Plant](../images/items/camping-gear/potted_plant.png) | Potted Plant | 5 × 8 | Stands | None |
| ![Macrame Hanging Planter](../images/items/camping-gear/macrame_planter.png) | Macrame Hanging Planter | 5 × 10 | Hangs from the ceiling hook | None |
| ![Cactus Pot](../images/items/camping-gear/cactus_pot.png) | Cactus Pot | 4 × 7 | Stands | None |
| ![Percolator](../images/items/camping-gear/percolator.png) | Percolator | 4 × 7 | Stands | None |
| ![Enamel Kettle](../images/items/camping-gear/enamel_kettle.png) | Enamel Kettle | 5 × 5 | Stands | None |
| ![Saucepan](../images/items/camping-gear/saucepan.png) | Saucepan | 6 × 3 | Stands | None |
| ![Pair of Mugs](../images/items/camping-gear/mug_pair.png) | Pair of Mugs | 4 × 3 | Stands | None |
| ![Glass Sugar Pot](../images/items/camping-gear/sugar_pot.png) | Glass Sugar Pot | 3 × 4 | Stands | None |
| ![Fruit Bowl](../images/items/camping-gear/fruit_bowl.png) | Fruit Bowl | 6 × 3 | Stands | None |
| ![Chrome Toaster](../images/items/camping-gear/toaster.png) | Chrome Toaster | 6 × 5 | Stands | None |
| ![Oil Lamp](../images/items/camping-gear/oil_lamp.png) | Oil Lamp | 4 × 7 | Stands | None |
| ![Lava Lamp](../images/items/camping-gear/lava_lamp.png) | Lava Lamp | 3 × 8 | Stands | None |
| ![Transistor Radio](../images/items/camping-gear/transistor_radio.png) | Transistor Radio | 6 × 4 | Stands | None |
| ![Stack of Books](../images/items/camping-gear/book_stack.png) | Stack of Books | 6 × 3 | Stands | None |
| ![Folded Road Map](../images/items/camping-gear/road_map.png) | Folded Road Map | 6 × 1 | Stands | None |
| ![Photo Frame](../images/items/camping-gear/photo_frame.png) | Photo Frame | 4 × 5 | Stands | None |
| ![Cushion](../images/items/camping-gear/cushion.png) | Cushion | 7 × 3 | Stands | None |
| ![Tissue Box](../images/items/camping-gear/tissue_box.png) | Tissue Box | 5 × 3 | Stands | None |
| ![Desk Fan](../images/items/camping-gear/desk_fan.png) | Desk Fan | 4 × 6 | Stands | None |

## Low Chair (outside the vehicles)

![Low Chair](../images/items/camping-gear/low_chair.png)

A low folding camp chair with a brown canvas sling seat and a reclined canvas back on a silver aluminium frame, with wooden armrests and X braces under the seat and across the back. It is not decor: it stands on the ground outside the vehicles (ADR 0122). It is about 12 × 16 pixels, and its seat is 6 pixels above the ground.

- **Place it:** use the Low Chair item on the top of a block outside the vehicles. The chair faces you, turned to the nearest eighth of a turn. Clicked on short grass, a flower, or a carpet, it settles onto the ground under it. It needs two free blocks above the block, and it does not go on a camper's room blocks, within a vehicle's reach, or where another chair already stands. Outside Creative it uses up the item.
- **Sit on it:** long-press it on touch screens, or right-click it with a mouse; the button reads **Sit**. Sneak or jump to get up.
- **Take it back:** hit it three times in quick succession while nobody sits on it. It folds up and drops its item. Each hit before the third tells you how many more it takes.
- **Get one:** in Creative, it is the first item in the Camping Gear (Outside) group near the end of the Items tab. In Survival, craft it from two leather, two sticks, and two iron ingots (leather top-left and middle, sticks on either side of the middle, iron ingots in the bottom corners).

## Tent (outside the vehicles)

![Tent](../images/items/camping-gear/tent.png)

A tan-brown two-room tunnel tent with a tarp on two poles, a white inner bedroom with two blue mattresses, and a hanging milky lantern. It has no logo or product name (ADR 0130).

- **Get one:** find it in the Camping Gear (Outside) group after the Low Chair, or craft it from three wool, one stick, and two string (wool in the top middle, wool on either side of a stick in the middle row, string in the bottom corners). Any wool color works.
- Pitching comes with 9/13 of the tent work. Using the item does nothing yet; a summoned tent just stands there.

## Camp Table (outside the vehicles)

![Camp Table](../images/items/camping-gear/camp_table.png)

A 30 px long bamboo-colored wooden top on black folding X legs, based on the supplied front, side, top, and grain references. It is long enough for two Low Chairs side by side. Place it from its item on a block top outside vehicle space. Two people can use **Sit** to sit side by side along one long edge; Low Chairs are separate items. The tabletop does not hold placed items or blocks. Hit the table three times in quick succession while nobody is seated to fold it back into its item. In Survival, craft it from three bamboo planks, a stick, and two iron ingots.

## In the game

Inside gear is vehicle-linked and cannot be crafted: each item is only a carrier that works when held and pressed on a parked camper's furniture slot, where the vehicle feature turns it into decor; it does nothing on the ground.

Outside gear consists of plain camp-feature items that anyone can take from Creative or craft in Survival and place on the ground as their own Low Chair, Tent, or Camp Table entity without a camper or any other vehicle present; they are never decor or box contents, and still refuse placement inside a vehicle's space (ADR 0122, 0129, 0152).

Creative players find the 19 decor items above in the **Camping Gear (Inside)** group near the end of the Items tab. Each item has a decor block, `yasu_ride:<id>_decor`, that the parked camper lays on a furniture slot. The block has no collision and cannot be broken. Its `yasu_ride:height` state (0 to 15) lifts the gear by that many pixels to the slot's top. On the ceiling hook it lifts the hanging planter so that its top meets the hook. Its `yasu_ride:face` state is the parked camper's facing in quarter turns (0 south, 1 west, 2 north, 3 east). The block turns the gear so that the side shown at the front of its preview faces the camper's front. Its `yasu_ride:spot` state (0 to 4) moves the gear from the middle of its cell to one of the four stove burner spots of ADR 0107, which no slot uses since the stove got one burner in its middle (ADR 0112). A shelf board and the table hold two items, drawn by one block in the furniture's cell, `yasu_ride:shelf_decor_pair` or `yasu_ride:table_decor_pair`, whose states name the item at each end (ADR 0108).

## Getting the gear

The first time you place a camper, you get one Camping Gear Box. Use it (tap or right-click, in the air or on a block) to unpack all 19 items into your inventory, each marked "Camping gear" under its name; what does not fit drops at your feet. Each player gets one box, however many campers they place. In Creative, the Camping Gear (Inside) group near the end of the Items tab holds the box first, then the 19 decor items.
