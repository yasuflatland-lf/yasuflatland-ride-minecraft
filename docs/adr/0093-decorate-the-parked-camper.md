# 0093. Decorate the parked camper

- Status: Accepted (the press on a model-only top, the per-item places, and the cargo check of decor slot cells are superseded by [0097](0097-press-the-camper-furniture-to-place-decor.md), and the floor-tap trigger of the shower-toilet by [0098](0098-a-block-for-the-camper-shower-toilet.md); extended by [0094](0094-the-camper-shower-toilet-door-and-shower.md), [0095](0095-sit-on-the-camper-toilet-while-parked.md), and [0096](0096-keep-the-dock-blocks-whole.md))
- Date: 2026-10-21
- Extends: 0009, 0063, 0067, 0068, 0092

## Context

The owner wants to decorate the inside of the camper with small things such as a potted plant or a coffee percolator, choose where each one goes, and take it off again (#347). Inside, the camper has a dashboard, two front seats, a dinette on the left (two facing seats and a table), and the bed at the rear left (0092). It has no counter, stove, shelf, or window sill.

Parking snaps the camper to a cell center and a quarter turn, and lays invisible room blocks (0068). While parked, a long-press inside reaches a room block, not the entity (0068, 0084). While driving, every player is in a seat and cannot reach the inside. The room blocks are cleared on every departure and laid again on the next park. The laid cells are saved on the entity, so they are cleared even after `/reload` or a restart (0063, 0068).

Drawing decor as bones of the camper model would need one bone for every pair of place and item, which would more than double the model's cubes. A block draws its own shape, so the camper model and the entity properties do not grow for decor. The cost is that decor is seen only while parked.

The camper entity already has 6 properties.

## Decision

### Furniture table

- The camper's furniture is one table, `CAMPER_FURNITURE` in `src/domain/vehicle/kinds/camper/furniture.ts`. It holds only camper values, so it stays in the camper kind (0050). Each row is one piece of furniture:
  - `kind`: one of `dashboard`, `table`, `dinette_seat`, `bed`, `shelf`, `stove`, `counter`, `wall_cabinet`, `ceiling_hook`, `shower_toilet`
  - `cells`: the local cells it fills, as `{ x, z, layer }` in the coordinates of `room.ts`
  - `slots`: where decor can stand on it, each `{ id, cell, height }`. `height` is the furniture's top above the cell bottom in pixels (0 to 15). The id is saved with the decor, so it never changes
  - `block` (optional): a room block laid in every cell of the row. A row without a block is drawn only by the model, and players walk through it like the dinette table today
- The room, parking, and departure code read the table and never name a piece of furniture:
  - `roomCells` lays each row's block in each of its cells
  - The parking check and `cargoCells` skip every cell that holds a furniture block, because that block belongs to the camper
- The bed of 0092 is the first row: cells (1, -2, 1) and (1, -3, 1), the block `bed`, no slots. The bed is never a slot, because a long-press on it sleeps (0092)
- A slot lies in a cell of its own row. A cell holds at most one slot, and a row with a block has no slots

### New furniture

The camper model (`tools/gen_camper.py`) gains four pieces of furniture in the right column, x = -1. The left column is full (the passenger seat, the dinette, and the bed), the middle column is the aisle, and the right column holds the driver's seat at z 2. None of them reaches into the door cell (z 0) or the aisle (x 0). The table also gets a ceiling hook above it, in the second layer of the table's cell. The hook is not over the aisle, so a hanging item never hangs in front of a walking player's face. At first no new row has a block, so players walk through the furniture. Collision comes later by giving a row a block and adding that block's JSON, with no change to the room, parking, or departure code.

| Furniture | Cells (x, z, layer) |
|---|---|
| Tall shelf, behind the driver's seat | (-1, 1, 1), (-1, 1, 2) |
| Stove, part of the counter | (-1, -1, 1) |
| Counter with a sink | (-1, -2, 1) |
| Wall cabinet above the stove and counter | (-1, -1, 2), (-1, -2, 2) |
| Ceiling hook above the table | (1, 0, 2) |
| Shower-toilet room in the rear right corner | (-1, -3, 1), (-1, -3, 2) |

The spike's storage chest stood in the rear right corner (docs/spike-camper.md). That corner is now the shower-toilet room, so any future storage goes under the counter.

### Slots

| Slot id | Furniture | Cell (x, z, layer) | Height (px) |
|---|---|---|---|
| `dashboard_center` | dashboard | (0, 3, 1) | 13 |
| `dashboard_left` | dashboard | (1, 3, 1) | 13 |
| `table` | table | (1, 0, 1) | 12 |
| `dinette_front` | dinette_seat | (1, 1, 1) | 7 |
| `dinette_rear` | dinette_seat | (1, -1, 1) | 7 |
| `shelf_low` | shelf | (-1, 1, 1) | 10 |
| `shelf_high` | shelf | (-1, 1, 2) | 4 |
| `stove` | stove | (-1, -1, 1) | 14 |
| `counter` | counter | (-1, -2, 1) | 14 |
| `wall_cabinet_front` | wall_cabinet | (-1, -1, 2) | 13 |
| `wall_cabinet_rear` | wall_cabinet | (-1, -2, 2) | 13 |
| `ceiling_hook` | ceiling_hook | (1, 0, 2) | 0 |

The model builds every new piece of furniture so that its top is at its slots' heights.

The `ceiling_hook` slot is for hanging items. Its height is 0, and a hanging item's block model hangs down from 29 px above the bottom of its cell. 29 px is the underside of the ceiling plate (the plate's underside is at 28.8 px in the model, so the item's top knot meets it). A custom block's geometry is expected to reach up to 30 px above the cell bottom, which is not yet verified. The PR that adds the decor blocks checks it in game.

### Camping gear

- Nineteen items, after the interior of a 1970s motorhome (#347). They use the colors of that era: avocado green, harvest gold, burnt orange, brown, cream, and chrome. Each item lists the furniture it may stand on or hang from:

| Id | Name | Width × height (px) | Places |
|---|---|---|---|
| `potted_plant` | Potted Plant | 5 × 8 | table, shelf |
| `macrame_planter` | Macrame Hanging Planter | 5 × 10 | ceiling_hook (hanging) |
| `cactus_pot` | Cactus Pot | 4 × 7 | shelf, table |
| `percolator` | Percolator | 4 × 7 | stove |
| `enamel_kettle` | Enamel Kettle | 5 × 5 | stove |
| `saucepan` | Saucepan | 6 × 3 | stove |
| `mug_pair` | Pair of Mugs | 4 × 3 | table, counter |
| `sugar_pot` | Glass Sugar Pot | 3 × 4 | counter |
| `fruit_bowl` | Fruit Bowl | 6 × 3 | table |
| `toaster` | Chrome Toaster | 6 × 5 | counter |
| `oil_lamp` | Oil Lamp | 4 × 7 | table, shelf |
| `lava_lamp` | Lava Lamp | 3 × 8 | shelf |
| `transistor_radio` | Transistor Radio | 6 × 4 | shelf, dashboard |
| `book_stack` | Stack of Books | 6 × 3 | shelf, table |
| `road_map` | Folded Road Map | 6 × 1 | table, dashboard |
| `photo_frame` | Photo Frame | 4 × 5 | shelf |
| `cushion` | Cushion | 7 × 3 | dinette_seat |
| `tissue_box` | Tissue Box | 5 × 3 | dashboard, shelf |
| `desk_fan` | Desk Fan | 4 × 6 | counter, dashboard |

- Of the 20 candidates in #347, the colored glass ashtray is dropped because children play this add-on. The macrame planter stays, hanging from the ceiling hook. The potted plant and the cactus pot move from the window sill to the shelf and the table
- An item hangs exactly when its only place is `ceiling_hook`. A standing item is at most 8 px high and stands on its slot. A hanging item is at most 10 px high and ends at 29 px above its cell bottom
- A `wall_cabinet` slot accepts every item whose places include `shelf`, because a wall cabinet top is used like a shelf. Every other slot accepts an item only when the item's places include the slot's furniture
- `tools/camping_gear.json` is the single list of the items, in the order above. It gives each item's id, English name (`name_en`), Japanese name (`name_ja`), size, places, whether it is glass, whether it hangs, and an optional reference link. `tools/gen_camping_gear.py` generates the packs' gear files from it during `pnpm model`
- `pnpm lint:lang` allows Japanese characters only in `texts/*.lang`, so `name_ja` is written as ASCII `\u` escapes. The generator never writes `packs/yasu_ride_rp/texts/ja_JP.lang`. The PR that adds the items copies the `name_ja` values into `ja_JP.lang`, and a test checks that the lang values equal `name_ja`
- Each item is a custom item `yasu_ride:<id>` in the `items` menu category, with the name key `item.yasu_ride:<id>.name`. Items unpacked from the camping gear box carry the lore line `yasu_ride.lore.camping_gear` ("Camping gear"), which a script sets with `ItemStack.setLore`. Items taken from the creative inventory or returned from decor carry no lore line

### Decor blocks

- Each item has a decor block `yasu_ride:<id>_decor`:
  - It has menu category `none` and the name key `tile.yasu_ride:<id>_decor.name`
  - Its geometry is `geometry.yasu_ride.<id>`, in `packs/yasu_ride_rp/models/blocks/yasu_ride/<id>.geo.json`
  - All gear shares one texture atlas, `packs/yasu_ride_rp/textures/blocks/yasu_ride/camping_gear.png`, with the terrain texture shortname `yasu_ride_camping_gear`
- A decor block has no collision. Its selection box fits its shape, so it can be long-pressed. Mining and explosions cannot break it. Glass items render with `blend`, and every other item renders `opaque`
- Two states place the model inside its cell, which it stands in at the center:
  - `yasu_ride:face` (0 to 3) is the camper's snapped yaw in quarter turns: yaw 0 is 0, 90 is 1, 180 is 2, and -90 is 3. The block turns its model by that many quarter turns, so an item faces the same way in the camper whatever the camper's heading
  - `yasu_ride:height` (0 to 15) is the slot's height in pixels
- The decor block's custom component is `yasu_ride:camper_decor`

### Saving and laying decor

- The camper entity saves its decor in the dynamic property `yasu_ride:decor`, a JSON array of `{ slot, item }`. On load, an entry with an unknown slot, an unknown item, or a slot already used is dropped
- The decor is laid with the parked room as the dock block `{ type: "decor", item, face, height }`, with the block `yasu_ride:<item>_decor`, in the slot's cell. It is cleared with the room on departure and laid again in the same slots on the next park
- `cargoCells` also skips every slot cell that holds decor, because that block belongs to the camper

### Placing and removing

- Decor is placed only in a parked camper. Placing reads `world.beforeEvents.playerInteractWithBlock`:
  1. The player long-presses (touch) or right-clicks (mouse) a room block or decor block of a parked camper while holding a camping gear item.
  2. The hit point is the block's location plus `faceLocation`. A slot's point is its cell's center in x and z, and its cell bottom plus `height / 16` in y.
  3. The item goes to the free slot nearest the hit point, among the slots that accept it. A tie goes to the slot listed first.
  4. Placing takes one item from the hand, except in Creative mode, like placing a vehicle (0024).
  5. When no free slot accepts the item, the player's action bar shows the message `yasu_ride.message.decor_no_slot` ("No free spot for this item"), and the player keeps the item.
- A long-press on a model-only top, such as the table, reaches the floor block under it. The nearest-slot rule then picks the slot on top. Check on a phone that it picks the right one
- With an empty hand, a long-press on a decor block removes that decor through the `yasu_ride:camper_decor` component. The item goes straight into the player's inventory, not dropped in the narrow room. It is dropped at the player's feet only when the inventory is full
- When a player hits the camper back into its item (0067), every placed decor item goes into that player's inventory, and what does not fit is dropped at their feet

### Camping gear box

- The first time a player places a camper, they receive one `yasu_ride:camping_gear_box` ("Camping Gear Box"). The player dynamic property `yasu_ride:camping_gear_given` records it, so later campers give nothing. The box is given on placement rather than with a crafting recipe for two reasons: a recipe has only one output, and the stable API has no crafting event
- Using the box takes it and gives one of each of the 19 items, each with the lore line. What does not fit is dropped at the player's feet

### Creative group

- The items and the box form the creative group `yasu_ride:camping_gear` at the end of the Items tab. It is defined in `packs/yasu_ride_bp/item_catalog/crafting_item_catalog.json` (`format_version` 1.21.60, category `items`), with the box as its icon
- The group name is also its lang key: `yasu_ride:camping_gear=Camping Gear`. The owner checked this on the dev server on 2026-10-21
- `crafting_item_catalog.json` sits at an engine-fixed path, like `textures/item_texture.json`

### Preview pages

- `pnpm model` renders each item's block model with `tools/render_preview.py` to `docs/images/items/camping-gear/<id>.png`. `pnpm model:check` fails on a stale image, as it does for the vehicle previews
- `README.md` has an "Items" section after "Vehicles" that links `docs/items/README.md`. That page lists each creative group with a link to its page and its item count
- `docs/items/camping-gear.md` has one table row per item: preview, name, size, places, and reference
- `tests/packs/campingGear.test.ts` ties the spec, the generated geometry, the page rows, the images, the blocks, the items, the creative group, and the lang keys together. A new item without a page row or an image fails it
- The owner reviews the looks on the pull request's branch and names only the items to change

### Shower-toilet room

- The room's door is the bone `shower_door`, a child of `body`. It is on the aisle side of the room's cells (toward x = 0) and hinged on its rear edge. Its angle follows the float entity property `yasu_ride:shower_door` (0 to 1, client synced), which swings the bone up to 90 degrees into the aisle. It swings over 10 ticks, like the entry door (0068). After a reload the door's swing is restored, like the entry door's
- The shower uses a second entity property, the bool `yasu_ride:shower` (client synced), which is true while the shower runs. While it is true, the client emits the particle `yasu_ride:shower_spray` at the model's `shower_head` locator every 0.1 s, and plays the running-water loop `yasu_ride.shower` (made by `tools/gen_sounds.py`) every 1 s. The script spawns no particles and plays no sounds for the shower. #347 had the script spawn them; with the property, the client draws the spray at the model's own locator and loops the sound without a script call every few ticks. The shower is not restored after a reload, so it is off
- These two properties, the `shower_door` bone, and the `shower_head` locator extend the camper's bone contract (0009) and its entity contract (0067). The camper entity then has 8 properties
- The shower runs for `CAMPER_SPEC.showerTicks` (100 ticks, 5 s). A tap while it runs starts the 100 ticks over
- Until the room has a block, a long-press on it reaches the floor block under the room's cell. The room's floor block gets no custom component and its JSON does not change, so a held block still goes onto the room floor with a plain tap. Instead, the `world.beforeEvents.playerInteractWithBlock` handler that places decor also routes floor taps, after its decor branch:
  - It acts only when `isFirstEvent` is true, the player's hand is empty (no `itemStack`), and the block is the camper floor block (`CAMPER_FLOOR_BLOCK`)
  - It does not cancel the event, because an empty-hand tap on the floor does nothing in vanilla
  - Before events cannot change the world, so it calls `TapDockFloor` on the next tick with `system.run`, as placing does
- In a parked camper, a tap on the floor cell under the shower-toilet room (local x -1, z -3, the floor layer) works as follows:
  - From a player whose position is outside that cell's block column, it opens or closes the door
  - From a player inside that column, it runs the shower
  - A tap on any other floor cell does nothing
- Opening the door and running the shower are use cases that do not know which block was pressed (`UseShowerDoor` and `RunShower`). A third use case, `TapDockFloor`, is the floor tap's entry point: it finds the room that owns the tapped floor and asks the vehicle what the tap means. When the room gets a block, that block's custom component calls the same two use cases
- Departure shuts the shower door at once and stops the shower, the same way it shuts the entry door
- The toilet is a fifth deck seat (0063), there only while parked, in the room's lower cell:
  - The camper's own seats stay at four
  - It is the only deck seat with no vehicle seat behind it, so it exists while parked even when all four vehicle seats are taken. While parked, deck-seat and vehicle riders can then number five instead of 0063's four
  - On departure, its rider boards the camper like any deck seat rider when a vehicle seat is free. Otherwise the rider is taken off the toilet seat and treated like a player standing inside without a seat (0068)

## Consequences

- Decor is visible only while parked. While driving, the furniture shows bare
- Players walk through the new furniture until a row gets a block
- The camper entity has two more properties (`yasu_ride:shower_door` and `yasu_ride:shower`, 8 in total), one more bone (`shower_door`), and one more locator (`shower_head`)
- The room's floor block stays without a custom component, so placing blocks on the room floor works as before. Empty-hand floor taps reach the shower-toilet room through the same before-event handler that places decor
- Every new kind of gear is one entry in `tools/camping_gear.json`, with its Japanese name as `\u` escapes, plus its lines in both lang files, followed by `pnpm model` and a review on the preview page
- Check on a phone:
  - that a long-press on the table picks the table slot, not a dinette slot
  - that a cushion does not sink into a seated player
- Check in game that a hanging item's block geometry, which reaches 29 px above its cell bottom, renders
- If players want decor on the windows, add furniture rows with slots there rather than special cases
