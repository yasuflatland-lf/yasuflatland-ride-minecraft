# Camping gear

Small 1970s motorhome gear made to decorate a parked camper. Back to the [item groups](README.md).

Each item stands in the middle of one slot on the camper's furniture, except the Macrame Hanging Planter, which hangs from the ceiling hook. Sizes are width × height in pixels, at 16 pixels per block. An item that goes on a shelf also goes on the wall cabinet (ADR 0093). `pnpm model` draws the previews from the block models it generates from `tools/camping_gear.json`.

| Preview | Name | Size (px) | Places | Reference |
|---|---|---|---|---|
| ![Potted Plant](../images/items/camping-gear/potted_plant.png) | Potted Plant | 5 × 8 | Table, shelf | None |
| ![Macrame Hanging Planter](../images/items/camping-gear/macrame_planter.png) | Macrame Hanging Planter | 5 × 10 | Ceiling hook | None |
| ![Cactus Pot](../images/items/camping-gear/cactus_pot.png) | Cactus Pot | 4 × 7 | Shelf, table | None |
| ![Percolator](../images/items/camping-gear/percolator.png) | Percolator | 4 × 7 | Stove | None |
| ![Enamel Kettle](../images/items/camping-gear/enamel_kettle.png) | Enamel Kettle | 5 × 5 | Stove | None |
| ![Saucepan](../images/items/camping-gear/saucepan.png) | Saucepan | 6 × 3 | Stove | None |
| ![Pair of Mugs](../images/items/camping-gear/mug_pair.png) | Pair of Mugs | 4 × 3 | Table, counter | None |
| ![Glass Sugar Pot](../images/items/camping-gear/sugar_pot.png) | Glass Sugar Pot | 3 × 4 | Counter | None |
| ![Fruit Bowl](../images/items/camping-gear/fruit_bowl.png) | Fruit Bowl | 6 × 3 | Table | None |
| ![Chrome Toaster](../images/items/camping-gear/toaster.png) | Chrome Toaster | 6 × 5 | Counter | None |
| ![Oil Lamp](../images/items/camping-gear/oil_lamp.png) | Oil Lamp | 4 × 7 | Table, shelf | None |
| ![Lava Lamp](../images/items/camping-gear/lava_lamp.png) | Lava Lamp | 3 × 8 | Shelf | None |
| ![Transistor Radio](../images/items/camping-gear/transistor_radio.png) | Transistor Radio | 6 × 4 | Shelf, dashboard | None |
| ![Stack of Books](../images/items/camping-gear/book_stack.png) | Stack of Books | 6 × 3 | Shelf, table | None |
| ![Folded Road Map](../images/items/camping-gear/road_map.png) | Folded Road Map | 6 × 1 | Table, dashboard | None |
| ![Photo Frame](../images/items/camping-gear/photo_frame.png) | Photo Frame | 4 × 5 | Shelf | None |
| ![Cushion](../images/items/camping-gear/cushion.png) | Cushion | 7 × 3 | Dinette seat | None |
| ![Tissue Box](../images/items/camping-gear/tissue_box.png) | Tissue Box | 5 × 3 | Dashboard, shelf | None |
| ![Desk Fan](../images/items/camping-gear/desk_fan.png) | Desk Fan | 4 × 6 | Counter, dashboard | None |

## In the game

Creative players find every item above in the **Camping Gear** group at the end of the Items tab. Each item has a decor block, `yasu_ride:<id>_decor`, that the parked camper lays on a furniture slot. The block has no collision and cannot be broken. Its `yasu_ride:height` state (0 to 15) lifts the gear by that many pixels to the slot's top. Its `yasu_ride:face` state is the parked camper's facing in quarter turns (0 south, 1 west, 2 north, 3 east). The block turns the gear so that the side shown at the front of its preview faces the camper's front.
