# 0108. Two items on each shelf board and on the table

- Status: Accepted
- Date: 2026-10-22
- Supersedes in part: 0093 (one slot on each shelf board and on the table), 0097 (a press first tries the slots of the pressed cell only, and a deck seat names the slot of the first slot block above it, whatever that block draws), 0107 (a spot within its own cell, a standing decor box over the whole cell for every spot, and a furniture block in every slot cell)

## Context

In the play test of 2026-10-22 (#424) the owner asked for two items side by side on each board of the tall shelf behind the driver's seat, and then for two items on the dinette table too.

Facts this decision builds on:

- A room cell holds one block, so it shows one decor item, and the decor block draws its item through `minecraft:transformation`, whose translation moves the selection box with the model (0093, 0097, 0107). The shelf fills one cell per board, (-1, 1, 1) and (-1, 1, 2), and the table one cell, (1, 0, 1), so a second item on a board or the table cannot have its own block in that cell
- 0107 gave a slot a spot: an offset in pixels from its cell middle, turned with the camper's yaw into the decor block's `yasu_ride:spot` translation
- In `tools/gen_camper.py` each shelf board runs from model z -23 to -9, 7 px either side of the shelf cell's middle at z -16, between end panels at -23.5 to -23 and -9 to -8.5; it is 13.4 px deep (x 9 to 22.4). The low board's top is 10 px above its cell bottom and the high board's 4 px. The table top runs from x -23 to -9 across the camper, 7 px either side of its cell middle at x -16, and from z -6 to 6 along it, 12 px above its cell bottom. The camper wall's inner face is 22.8 px from the middle
- The standing items reach at most 3.5 px to each side across the camper (the cushion) and 3 px forward and back (the cushion and the fruit bowl). Two items along a board need 6 px of its 14 px; two across the table need 7 px of its 14 px. Two items along the 12 px table would overlap, so the table's pair runs across it
- The neighbor cells of each furniture, while parked:
  - Shelf: in front of it, (-1, 2, 1) and (-1, 2, 2) are the driver's seat cell. The driver's deck seat stands there, but no room block, furniture block, door, exit, or slot does; they were cargo cells, read only when the camper departs. Behind it, (-1, 0, 1) is the cell inside the entry door, which every player walks through and which no furniture may fill. Toward the aisle, (0, 1, 1) is the aisle. Toward the wall is the wall
  - Table: in front of and behind it are the dinette seats, whose cells already host their own slots, and above it the ceiling hook's cell hosts the hook's slot. Toward the wall is the wall. Toward the aisle, (0, 0, 1) is an aisle cell with no room block, furniture, deck seat, door, or exit; it was a cargo cell
- A decor block has no collision, so a block in the aisle or the driver's seat cell does not stop a player walking or sitting there

## Decision

### A slot hosted in a neighbor

- A slot keeps `cell`, now its host cell: the cell where its decor or furniture block is laid. A slot whose item stands over another furniture cell names that cell in `over`. A slot's spot is measured from its host cell's middle and may lie up to one cell away; `tests/domain/vehicle/kinds/camper/furniture.test.ts` checks that every spot lies within 8 px of its furniture cell's middle and that a host cell outside the furniture is a free interior neighbor on the same layer
- Each shelf board gets two slots along the camper, 3.5 px either side of the board middle: 0.5 px clear of each end panel and 1 px apart for the deepest items. The rear end stays in the shelf cell and keeps the board's id, `shelf_low` or `shelf_high`; it is spot 5 (forward -3.5). The front end, `shelf_low_front` or `shelf_high_front`, is hosted in the driver's seat cell on the same layer, (-1, 2, 1) or (-1, 2, 2), at spot 6 (forward -12.5 = -16 + 3.5)
- The table gets two slots across the camper. `table` keeps its id and stands its item 3.3 px toward the wall, spot 7 (left 3.3), so the widest item ends at the wall's inner face. `table_aisle` is hosted in the aisle cell (0, 0, 1) and stands its item 3.7 px toward the aisle, spot 8 (left 12.3 = 16 - 3.7). The two widest items touch and do not overlap; the aisle-side one overhangs the table's aisle edge by 0.2 px
- The driver's seat cell is used rather than the cell inside the door because that cell must stay free for walking in (0068), and the shelf's front end is next to the driver's seat anyway. The aisle cell is the only free neighbor of the table
- A cell still holds one item, so the rules of 0107 for a taken cell hold per host cell: the two ends of a board or the table are taken independently
- A host cell outside its furniture is air while it is empty, so a player can put a block there, as in any cargo cell. A slot whose cell holds anything but air, the furniture block, or its own decor is not free: a press skips it and picks among the other free slots, so the item is never taken from the hand while its decor block cannot be laid. The press reads the slot cells once

### Pressing

- A press on a cell names the slots of the furniture under it: the slots drawn over that cell, and the slots drawn over the furniture of a slot hosted in that cell (`pressedSlots`). A press on a shelf board's or the table's furniture block or on either of its items names both of its slots, and the item goes to the free one whose point is nearest the hit point. A press anywhere else keeps the nearest-free-slot rule. An empty-hand press takes back the item of the pressed block's own cell, as before
- A cell that only hosts slots drawn over a neighbor gets no furniture block while it is empty. The aisle cell and the driver's seat cell stay air, so a box there never catches a press meant for the aisle, the floor, or the driver's seat. An empty second slot is reached through its furniture: the furniture block while both ends are empty, the other end's item once that one holds something, or, past the item's half box, the room block behind, which falls back to the nearest free slot
- A deck seat names the slot of the first slot block above it (0097, 0104). A decor block drawn over a neighbor's furniture, on spot 6 or 8 (`HOSTED_DECOR_SPOTS`), names none, so a press on the driver's deck seat with gear in hand still seats the driver while the shelf's front end holds an item

### The decor box on a shared furniture

- The decor blocks get spots 5 to 8, so `yasu_ride:spot` runs from 0 to 8. Spots 5 and 6 have permutations for heights 4 and 10, and spots 7 and 8 for height 12, so every decor block has 80 + 24 = 104 permutations
- On spots 5 to 8 a standing item's selection box covers only its half of the furniture cell: from the furniture middle to the cell edge on its side along the pair's axis, and the whole cell across it, from the item's base to its top as in 0107. The two halves of a board or the table do not overlap, so a press there reaches one item, and no box of a hosted item reaches into the aisle or the driver's seat cell. `tools/gen_camping_gear.py` writes the box in each permutation of those spots (`SPOT_BOXES`), and `tests/packs/campingGear.test.ts` derives it from the domain slots and checks in every facing that the two boxes of each pair stay inside the furniture cell and split it exactly
- Every other spot keeps the whole-cell box of 0107, and a hanging item keeps its footprint box

### Departure and parking

- A host cell is a slot cell like any other: it is not a cargo cell, the park check requires it to be passable, and the departure check accepts air, the furniture block, or the decor block of the item in that cell. The cargo cells drop from 49 to 46 and the slot cells rise from 10 to 13; the 168 park checks stay the same

## Consequences

- Each shelf board and the table hold two items. Decor saved in `shelf_low` or `shelf_high` moves 3.5 px toward the rear of its board, and decor saved in `table` moves 3.3 px toward the wall; no saved decor is lost
- The decor block of a hosted item stands 12.5 px (shelf) or 12.3 px (table) away from where it is drawn, and its half box lies entirely outside its own cell, over the furniture. 0107 only had boxes reaching 5.4 px past their cell. Check in game that a hosted item renders over the board or the table in all four facings and that it can be pressed, both to take it back and to place a second item. If the engine picks a block only through its own cell, a hosted item cannot be pressed; then revisit with a box that keeps a sliver in its host cell, or with the pair on one cell's spots
- With one item at the shelf's rear end or the table's wall side, a press on the empty half has no decor box over it and reaches the wall or the floor behind, which sends the item to the nearest free slot, normally the empty end. Check in game that it does
- The front-end decor blocks share the driver's seat cells with the driver's deck seat. Check that the driver can still sit, ride off, and see out with items on both front ends
- The table's aisle-side block shares the aisle cell with walking players. Check that walking through the aisle, in either direction, is not stopped and that a press aimed down the aisle does not catch the table item's box
- Every decor block definition grows from 80 to 104 permutations. The Behavior Pack changes and the server needs a restart (0015); the Resource Pack does not change, because the gear models stay the same
- Another furniture that wants two items in one cell needs a free neighbor cell to host the second, new `DECOR_SPOTS` entries, the same offsets and heights in `SPOTS` and `SPOT_HEIGHTS` of `tools/gen_camping_gear.py`, and half boxes in `SPOT_BOXES`
