# 0099. Hang the camper planter inside its cell

- Status: Accepted
- Date: 2026-10-21
- Supersedes in part: 0093 (where a hanging item's model ends)

## Context

0093 hangs a hanging decor item's block model down from 29 px above the bottom of the `ceiling_hook` slot's cell (local x 1, z 0, layer 2), the underside of the camper's ceiling plate. The 10 px Macrame Hanging Planter spanned 19 to 29 px. 0093 expected custom block geometry to render up to 30 px above the cell bottom, and left that for a play test.

The v0.12.0 play test (#393) showed that it does not. The client drew a brown square of pixel noise above the table: an unshaped block textured with the whole camping gear atlas, instead of the planter. The decor block's selection box also covered 0 to 10 px, below the model, so the outline and the presses did not match the item.

## Decision

- Every camping gear block model stays within 0 to 16 px of its cell. `tools/gen_camping_gear.py` fails when a model leaves the cell
- A hanging item's model ends at the top of its cell: `HOOK_Y` is 16, so the planter spans 6 to 16 px. The `ceiling_hook` slot keeps height 0
- A decor block's selection box covers its model: from the model's bottom to its top, clamped to 0 to 16 px. A standing item keeps 0 to its height; the planter gets 6 to 16
- The furniture block laid in the empty `ceiling_hook` cell has a selection box over 6 to 16 px, where a hanging item will hang
- The camper model draws the rest of the hook as fixed geometry in the body bone: a chrome base plate under the ceiling plate, an ivory cord down to the top of the `ceiling_hook` cell (model y 48), and a small chrome hook from 48 to 49.5. Nothing of it reaches into the cell
- This replaces 0093's "hangs down from 29 px above the bottom of its cell" and "ends at 29 px above its cell bottom". The rest of 0093 stands

## Consequences

- The planter hangs about 13 px lower than before, with its bottom 10 px above the table top
- The cord and the hook show while driving too, with nothing on them
- The camper model changes, so the Resource Pack version goes up (0015)
- A standing item lifted by the decor block's height state can still reach above 16 px through `minecraft:transformation` (for example a percolator on the stove). The play test found no problem there. If such an item ever shows the same unshaped block, move its height into the model instead
- Check on a phone and on PC that the planter shows as a planter under the hook, that the cord meets its top knot, and that aiming at the planter outlines it
