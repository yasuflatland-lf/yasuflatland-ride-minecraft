# 0107. Stand stove gear on a burner, and widen the standing decor box

- Status: Accepted (measuring a slot's nearness from the hit point is superseded by [0110](0110-pick-decor-slots-along-the-line-of-sight.md): it is measured where the line of sight crosses the slot's surface)
- Date: 2026-10-22
- Supersedes in part: 0097 (a decor block's selection box at the item's footprint), 0100 (stove decor standing on the bare plate in the middle of the cooktop)

## Context

0100 drew the stove with four gas burners in a 2 x 2 grid and kept the middle of the cooktop flat and free of burner parts, so the single `stove` slot stood its item on the bare plate between the burners, at 14 px. In the play test of 2026-10-22 (#421) the owner found this wrong: a saucepan, a kettle, or a percolator belongs on a burner, not between them.

The same play test showed a second problem. With gear on the stove, a long-press on the stove top often showed the toilet seat's ride button. A decor block's selection box was only the item's footprint (0097), so a press on the rest of the occupied stove passed through the cell and hit the toilet's deck seat behind it in the shower-toilet. 0097 accepted that a press beside an item misses the camper; it did not foresee that the press then reaches something else.

Facts this decision builds on:

- A room cell holds one block, so it can show one decor item (0093). The furniture block and the decor block of a slot share its cell (0097)
- The decor block draws its item through `minecraft:transformation`: the face state turns the model with the camper and the height state lifts it (0093). The translation applies after the rotation, in world axes, and the selection box moves with the model (0097)
- In `tools/gen_camper.py` the stove cell's middle is model (16, 32). The burners are centered at x 16 - 3.8 and 16 + 3.8 (the aisle side and the wall side) and z 26.6 and 37.35 (toward the sink and toward the far flange). A burner's grate ring is 3.24 px across and its prongs reach up to y 30.95; the plate top is y 30, 14 px above the cell bottom
- The camper wall's inner face is at x 22.8, and the widest standing item, the cushion, is 7 px wide

## Decision

### Burner slots

- The stove cell gets four decor slots, one per burner: `stove` (aisle side, toward the sink), `stove_rear` (aisle side, toward the far flange), `stove_wall` (wall side, toward the sink), and `stove_wall_rear` (wall side, toward the far flange). `stove` keeps its id, so decor saved in it comes back on its burner
- A slot names where on its cell its item stands with `spot`, an index in `DECOR_SPOTS` (`src/domain/vehicle/kinds/camper/furniture.ts`), in pixels left and forward of the cell middle. Spot 0 is the middle and is every other slot's spot. Spots 1 to 4 are the burners: left 3.8 on the aisle side and -3.3 on the wall side, forward 5.4 toward the sink and -5.35 toward the far flange. The wall-side spots sit 0.5 px in from their burner centers so that the 7 px cushion stays clear of the wall at x 22.8; they are still over the grate
- The burner slots are 15 px high. The prongs reach 14.95 px above the cell bottom and slot heights are whole pixels, so 15 is the lowest height that stands an item on the grate rather than in it. `tests/packs/camper.test.ts` checks that 15 is the ceiling of the highest body point within 2 px of each spot, and that no body cube, rotated ones included, reaches into any standing item's box on any burner slot
- A cell holds one item. A slot counts as taken while any slot of its cell holds decor: the nearest-free-slot rule, the pressed-slot rule, placing, and restoring all check the cell. While one burner holds an item, a press on the stove sends a second item to the nearest free spot elsewhere, or, from a dinette seat, refuses it (0104)
- A press on a cell with several free slots that accept the item picks the one whose point is nearest the hit point, so a press on the stove puts the item on the burner nearest it. A press elsewhere keeps the nearest-free-slot rule of 0097, measured to the spot points, so the burners now count at their own points
- An empty-hand press on the cell takes back the item of whichever of its slots holds one
- The room lays one block per slot cell: the furniture block at the height of the cell's first slot while the cell is empty (15 for the stove), or one decor block. The departure check reads each slot cell once and accepts air, the furniture block, or the decor block of the item in that cell
- Saved decor is restored entry by entry. An entry whose slot exists and whose cell is free takes its slot. An entry whose slot no longer exists, or whose cell an earlier entry already holds, moves to the first free slot that takes its item, or is stowed and given back when the camper breaks (0103). A stowed entry is neither laid nor counted as taking a cell. The test command that sets a slot directly replaces whatever another slot of that cell held

### The spot state

- The decor blocks get a third state, `yasu_ride:spot` (0 to 4). The dock block `{ type: "decor" }` carries `spot`, and the block is laid with it
- Each permutation of a decor block matches face, spot, and height. Its translation is the spot's offset turned by the camper's yaw quarter, `decorSpotOffset` in `room.ts`, plus the height on y. Spot 0 has a permutation for every height; spots 1 to 4 only for the heights their slots use (15), so each block has 64 + 16 = 80 permutations instead of 320. `tools/gen_camping_gear.py` lists the same offsets, and `tests/packs/campingGear.test.ts` checks every permutation against the domain, so a slot whose spot and height have no permutation fails there
- A decor cell saved on the vehicle before this change has no spot; it is read as spot 0, so the block is replaced and cleared as before

### The standing decor box

- A standing item's decor block selection box covers the whole cell width, x and z -8 to 8 px, from the item's base to its top, at least 1 px. A press anywhere over the occupied furniture top reaches the decor block. An empty-hand press there takes the item back, which is acceptable because a cell holds one item. This replaces 0097's "an occupied spot holds only its decor block, whose selection box is the item's own footprint" and its reason that a full box would have to start below its cell: the box starts at the item's base and moves up with it through the transformation, so it never starts below its cell
- A hanging item keeps its footprint box (0102). The hook box stays narrow for the reason in 0097: a standing player's eyes are about 10 px into the hook's layer, and a wide box there would catch presses aimed down at the table under the hook
- The empty furniture block keeps its boxes (0097)

## Consequences

- Gear on the stove stands on a burner, the one nearest the press, in all four facings; one item at a time
- Decor saved in `stove` moves from the middle of the cooktop to the aisle-side burner toward the sink, 1 px higher. Decor in any other slot does not move
- The empty stove's furniture block box rises from 14 to 15 px, the top of the burner grates
- The standing decor box follows the item's spot, so on a burner it reaches up to 5.4 px past the stove cell's edge, over the counter top and toward the aisle. It starts at the item's base, 1 px above the counter top, so a press aimed down at the counter or into the aisle should pass under it. Check in game that a press on the counter next to a burner item still reaches the counter, and that the item on each burner can be taken back
- A press beside an item on a furniture top now takes the item back with an empty hand instead of passing through to whatever is behind it, such as the toilet's deck seat. Check in game that the toilet seat's ride button no longer shows when pressing the occupied stove
- Every decor block definition grows from 64 to 80 permutations. The Behavior Pack changes and the server needs a restart (0015); the Resource Pack does not change, because the gear models stay the same
- Another furniture with several spots in one cell needs new `DECOR_SPOTS` entries, the same offsets in `SPOTS` of `tools/gen_camping_gear.py`, and its slots' heights in `SPOT_HEIGHTS`; the pack test fails until they agree
