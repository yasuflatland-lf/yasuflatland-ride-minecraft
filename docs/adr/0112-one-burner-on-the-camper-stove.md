# 0112. One burner on the camper stove

- Status: Accepted
- Date: 2026-10-22
- Supersedes in part: 0107 (the stove's four burners and their four slots)

## Context

0107 drew the camper stove with four gas burners in a 2 x 2 grid and gave each one a decor slot in the stove cell: `stove`, `stove_rear`, `stove_wall`, and `stove_wall_rear`. A cell holds one block, so the stove still held one item; the slot only chose which burner it stood on. A press on the stove put the item on the burner nearest the press.

Picking the burner the player meant turned out hard. 0110 measures a slot's nearness where the line of sight crosses the slot's surface, and 0111 corrects the inverted `faceLocation` height the engine reports. Even with both, the owner still could not put an item on the burner they pressed reliably in game (#436). The stove holds one item anyway, so four burners only add a choice that the game cannot read well.

Facts this decision builds on:

- In `tools/gen_camper.py` the stove cell's middle is model (16, 32), the point of a slot at spot 0. The burner that 0107 drew is 3.24 px across its grate ring and its prongs reach up to y 30.95, 14.95 px above the cell bottom. The plate top is y 30
- The widest standing item, the cushion, is 7 px wide. Centered at the cell middle it spans x 12.5 to 19.5, clear of the rear vent band at x 21.7 and of the wall at x 22.8
- Decor saved on the vehicle names its slot id (0093). Restoring moves an entry whose slot no longer exists to the first free slot that takes its item (0103, 0107)
- PR #429 adds `DECOR_SPOTS` entries after index 4 for the shelf and table ends (0108), and the decor blocks' `yasu_ride:spot` values 0 to 4 are part of the Behavior Pack

## Decision

- `tools/gen_camper.py` draws one burner, the same burner as 0107's, centered on the cooktop at (16, 32). The other three are gone. The sink, the vent band, the ledge, and the control panel stay
- The stove has one decor slot, `stove`, at spot 0, the cell middle, 15 px high, so the item stands on the burner's grate as in 0107. `tests/packs/camper.test.ts` checks that 15 is the ceiling of the highest body point within 2 px of the slot point, and that no body cube reaches into any standing item's box on the slot
- `stove_rear`, `stove_wall`, and `stove_wall_rear` are no longer slots. Decor saved under any of them loads as if saved under `stove`: `savedSlotId` in `src/domain/vehicle/kinds/camper/decor.ts` maps the three old ids to `stove` before restoring, so the item goes back on the stove instead of to the first free slot. If an earlier entry already holds the stove, the entry moves to the first free slot or is stowed, as in 0107. The test command that sets a slot refuses the old ids
- `DECOR_SPOTS` keeps entries 1 to 4, 0107's burner offsets, although no slot uses them. Removing them would shift every later index, including those #429 adds, and the decor blocks keep their `yasu_ride:spot` values 0 to 4 and their 80 permutations, so a decor block an older build laid on a burner still draws on that burner until the next lay replaces it
- The rest of 0107 stays: one item per cell, the cell-wide standing decor box, and the spot state. 0110 and 0111 stay too: the stove no longer needs them, but the other furniture does

## Consequences

- An item on the stove always stands on the one burner in the middle of the stove top, whichever part of the stove the player presses, in all four facings
- Decor saved on any of the four burners comes back on the middle burner, at the same height. A second stove entry, which only a hand-edited save could hold, moves to the first free slot as before
- The camper model changes, so the Resource Pack version goes up (0015). The decor block definitions do not change, so the Behavior Pack only follows the new Resource Pack version
- A decor block left on a burner spot by an older build is cleared by the next lay, which reads the saved dock cells, so it does not stay off the middle for long
- `DECOR_SPOTS` 1 to 4 and their decor block permutations are unused by the domain. They can be dropped later together with every index after them, once no world holds a block laid on them
