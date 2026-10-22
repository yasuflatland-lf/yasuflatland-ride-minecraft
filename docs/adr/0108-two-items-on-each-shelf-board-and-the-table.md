# 0108. Two items on each shelf board and on the table

- Status: Accepted (extended by [0114](0114-open-the-camper-wall-cabinet.md): the wall cabinet's compartments are pair blocks that show their items only while open)
- Date: 2026-10-22
- Supersedes in part: 0093 (one slot on each shelf board and on the table), 0107 (on the shelf boards and the table: a cell holding one item, an empty-hand press taking back whichever slot's item, one decor block per occupied slot cell, and a standing box that ends at the item's top)

## Context

In the play test of 2026-10-22 (#424) the owner asked for two items side by side on each board of the tall shelf behind the driver's seat, and then for two items on the dinette table too.

Facts this decision builds on:

- A room cell holds one block. Until now each placed item had its own decor block, `yasu_ride:<item>_decor`, which draws the item through `minecraft:transformation`: it turns the model by the camper's yaw quarter and moves it by the slot's spot and height (0093, 0107). The shelf fills one cell per board, (-1, 1, 1) and (-1, 1, 2), and the table one cell, (1, 0, 1)
- In `tools/gen_camper.py` each shelf board runs from model z -23 to -9, 7 px either side of the shelf cell's middle at z -16, between end panels at -23.5 to -23 and -9 to -8.5; it is 13.4 px deep (x 9 to 22.4). The low board's top is 10 px above its cell bottom and the high board's 4 px. The table top runs from x -23 to -9 across the camper, 7 px either side of its cell middle at x -16, and from z -6 to 6 along it, 12 px above its cell bottom. The camper wall's inner face is 22.8 px from the middle
- The standing items reach at most 3.5 px to each side across the camper (the cushion) and 3 px forward and back (the cushion and the fruit bowl). Two items along a board need 6 px of its 14 px; two across the table need 7 px of its 14 px. Two items along the 12 px table would overlap, so the table's pair runs across it
- The first build of this ADR laid the second item's decor block in a free neighbor cell, the driver's seat cell for the shelf and the aisle cell for the table, and translated it 12.5 px (shelf) or 12.3 px (table) back over the furniture. In game every decor block rendered as the fallback block, and the client content log showed, for every such permutation:

  `[Blocks][error]-Block name = 'yasu_ride:toaster_decor' | Transformation Component error for yasu_ride:toaster_decor["yasu_ride:spot" : 6, "yasu_ride:height" : 10, "yasu_ride:face" : 3] : Schematic 'geometry.yasu_ride.toaster' is not included within the unit cube on axis x.`

  and the same for spot 8 at height 12 on axis z. One bad permutation makes the client reject the whole block definition, so every placed block of that item type showed as the fallback block, not only the hosted ones
- That is the documented limit for block geometry, applied after the transformation. Microsoft Learn ([Advanced Block Visuals](https://learn.microsoft.com/en-us/minecraft/creator/documents/customblockoversized)): a block is at most 30 px on each axis, within 30 px of the origin in each direction, and "at least 1 pixel of your block on each axis must be contained by the base 16x16x16 block". The working decor blocks already rise above their cell (a counter item at 14 px, a stove item at 15 px, the cushion 0.4 px past the cell edge on a burner), and the client accepts them, because each keeps part of the item in the cell. The hosted item was moved entirely out of the cell on one axis, so nothing of it was left inside. A block's model cannot draw an item that sits wholly in a neighbor cell
- The selection box is limited to the cell before the transformation: origin and origin + size within (-8, 0, -8) to (8, 16, 8) ([minecraft:selection_box](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/blockreference/examples/blockcomponents/minecraftblock_selection_box))
- Both items of a pair stand inside the furniture cell: a board's ends 3.5 px either side of its middle, the table's 3.3 px toward the wall and 3.7 px toward the aisle. So one block in the furniture cell can draw both and keep them in its cell
- Block limits checked on Microsoft Learn before choosing the encoding:
  - [Block states and permutations](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/blockreference/examples/blockstatesandpermutations): a state lists its values, and permutation conditions may only use `query.block_state()`. All blocks of a world together should stay under 65,536 permutations; above that the game warns that performance may degrade
  - A state holds at most 16 values. Microsoft Learn does not state this number; the [Bedrock Wiki](https://wiki.bedrock.dev/blocks/block-states) does, and it matches the 0 to 15 `yasu_ride:height` state that every decor block already uses
  - [minecraft:geometry](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/blockreference/examples/blockcomponents/minecraftblock_geometry): `bone_visibility` sets each bone's visibility by name, and its values take Molang expressions since 1.20.10
  - [geometry 1.12.0](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/schemasreference/schemas/minecraftschema_geometry_1.12.0): a cube face may name a `material_instance`. No limit on bones or cubes is documented
- Two more limits, not on Microsoft Learn, made BDS refuse the first pair blocks in the CI in-game run; the refused table block was missing from the world, and the relay and pair scenarios failed:
  - `Block State enum array must have more than 1 value`: an enum state needs at least two values, and the table's height state listed only 12
  - `MaterialInstances can't mix and match opaque and transparent materials`: one block cannot have an `opaque` instance and a `blend` one, as the sugar pot's glass faces next to the opaque items had
  - [minecraft:transformation](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/blockreference/examples/blockcomponents/minecraftblock_transformation): rotation in 90 degree steps, translation, and scale, about the block's center; the page states no bounds of its own

## Decision

### Slots

- Each shelf board gets two slots along the camper, both in the board's cell: the rear end keeps the board's id, `shelf_low` or `shelf_high`, at spot 5 (forward -3.5), and the front end, `shelf_low_front` or `shelf_high_front`, is at spot 6 (forward 3.5). The ends stay 0.5 px clear of each end panel and 1 px apart for the deepest items
- The table gets two slots across the camper, both in the table's cell: `table` keeps its id at spot 7 (left 3.3), so the widest item ends at the wall's inner face, and `table_aisle` is at spot 8 (left -3.7). The two widest items touch and do not overlap; the aisle-side one overhangs the table's aisle edge by 0.2 px
- A slot of a two-item furniture names its `pair`: the furniture kind (`shelf` or `table`) and its end (0 or 1). Its item is taken only by its own end: the nearest-free-slot rule, the pressed-cell rule, placing, and restoring count a pair slot as taken while that slot holds decor. Every other slot still counts as taken while any slot of its cell holds decor (0107)
- `DECOR_SPOTS` 5 to 8 give the pair ends' offsets for slot points; they are not `yasu_ride:spot` values. The decor blocks keep spots 0 to 4 and their 80 permutations from 0107

### The pair blocks

- `yasu_ride:shelf_decor_pair` and `yasu_ride:table_decor_pair` draw both items of a shelf board or the table. The room lays the pair block in the furniture cell while either end holds an item, the furniture block while neither does. The dock block is `{ type: "decorPair", pair, face, height, end0?, end1? }`, with at least one end set
- Their geometry, `geometry.yasu_ride.<kind>_decor_pair`, has one bone per standing item per end, `end<n>_<item>`, 36 bones and 142 cubes. Each bone holds the item's cubes moved to its end's spot in the gear model's frame (the camper's left at -x, its forward at -z), so all of them stay over the furniture cell: x -3.5 to 3.5 and z -6.5 to 6.5 for the shelf, x -6.8 to 7.2 and z -3 to 3 for the table
- States, each with 2 to 16 values:
  - `yasu_ride:face` (0 to 3), the camper's yaw quarter as on a decor block
  - `yasu_ride:height`, the slot heights of the furniture, only where there are two or more: 4 and 10 for the shelf. The table's one height, 12, is not a state; its permutations lift it by 12 px, and the scripts leave the state out for it (`pairHeightStates`)
  - For each end n, the item as a code: 0 for an empty end and 1 + the item's index among the 18 standing items in `tools/camping_gear.json` order (`STANDING_GEAR_IDS`). 19 codes do not fit one state, so the code is split into `yasu_ride:end<n>_page` = code / 10 (0 or 1) and `yasu_ride:end<n>_item` = code % 10 (0 to 9)
- `bone_visibility` shows `end<n>_<item>` exactly when `q.block_state('yasu_ride:end<n>_page')` and `q.block_state('yasu_ride:end<n>_item')` name that item's code, so any two items, or one with the other end empty, render
- Each permutation matches face and height (face only on the table), turns the block by the face, and lifts it by the height, with no horizontal translation: 8 permutations for the shelf and 4 for the table. The state combinations come to 3,200 for the shelf and 1,600 for the table, against 6,080 for all 19 decor blocks together
- Every face uses `*` with `opaque`, the sugar pot's glass too, so on a shelf board or the table its glass shows as solid pale blue; on its own decor block it still blends. Blending the whole pair block instead would keep the glass see-through but draw every other item's faces without depth sorting
- The selection box covers the whole cell from the furniture top up to the tallest standing item, 8 px, over both items. The outline covers both ends; the owner accepted that
- `tools/gen_camping_gear.py` writes both blocks and both geometries (`PAIRS`, `PAIR_PAGE_SIZE`). `tests/packs/campingGear.test.ts` checks that each end's bone stands where the domain measures its slot in every facing, that each end's states show exactly the bone of the item the scripts set, and that every state stays within 16 values

### Pressing

- A press with gear on a shelf board's or the table's block, the furniture block or the pair block, names both of its slots, and the item goes to the free end nearest the press, measured along the line of sight (0110). The pressed height is corrected as on a decor block (0111): the pair block's lift is its height state, or the table's one slot height, since the table's block has no height state. With one end taken, a press anywhere on the block sends the item to the other end
- An empty-hand press on a pair block takes back the end nearest the pressed x and z, from the custom component's `faceLocation`. Both ends stand at one height, so y does not choose between them. The eye is not used: 0111 measured that the placing event reports y inverted, and nobody has measured this event's y, so a line of sight through it could point anywhere. Without a face location the first held end is taken
- A pair block counts as a decor block wherever one is recognized: a gear press on it places decor, and it is a slot block above a deck seat (0097)

### Departure, saved decor, and the earlier build

- The departure check accepts, in a pair cell, air, the furniture block, or the pair block of that furniture while either end holds an item. The cargo cells, the slot cells, and the 168 park checks are as before this ADR
- Decor saved in `shelf_low`, `shelf_high`, or `table` before this ADR comes back at the rear end of its board or the wall side of the table. Decor saved by the first build in `shelf_low_front`, `shelf_high_front`, or `table_aisle` comes back at those ends
- Dock cells that the first build saved with spots 5 to 8 are still read, so the next lay clears the decor blocks it left in the driver's seat cells, the aisle cell, and the furniture cells

### A check on every block

- `tests/packs/blockGeometry.test.ts` reads every block, applies each permutation's transformation to the cubes its geometry can show, and fails when any axis keeps less than 1 px inside the cell or reaches past 30 px, or when a selection box leaves the cell. It also checks that the pair blocks keep both items inside the cell horizontally in every permutation. The first build's toaster permutation fails this check on the axis the client named
- The same file fails when a block's enum state lists fewer than two values, or when its material instances mix `opaque` with another render method, the two load errors above

## Consequences

- Each shelf board and the table hold two items, in any combination, and a cell still holds one block. The driver's seat cells and the aisle cell stay free of decor
- An empty-hand press on a pair block takes back the item nearest the pressed x and z on its box, which spans 8 px above the furniture top. A press on the box top lands nearer the player than the item the player looks at, so a press between the two items leans toward the nearer one. Check in game, in all four facings, that each item comes back when pressed and that the one aimed at is the one taken
- The pair blocks rely on `bone_visibility` with `q.block_state` expressions. Microsoft Learn documents Molang in `bone_visibility` without naming the query, so check in game that each end shows only its own item, including the sugar pot next to another item
- The sugar pot's glass is opaque on a shelf board or the table and see-through elsewhere
- The outline covers both items of a board or the table, and 8 px of height above the furniture top whatever the items' heights
- The Resource Pack changes (two geometries), so its version goes up (0015), and the server needs a restart for the new blocks
- Another furniture that wants two items in one cell needs its own pair block: a `PAIRS` entry in `tools/gen_camping_gear.py`, its spots in `DECOR_SPOTS`, and its slots marked with `pair`. A third item per cell needs a third end with its own page and item states, and 18 more bones
