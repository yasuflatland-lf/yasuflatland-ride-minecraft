# 0102. Lift the hanging planter from its cell bottom

- Status: Accepted
- Date: 2026-10-21
- Supersedes in part: 0093 (the ceiling hook slot's height of 0), 0099 (where a hanging item's model starts and ends, and its decor block's selection box)

## Context

0099 kept the Macrame Hanging Planter inside its cell by hanging its model from the top of the cell, from 6 to 16 px, with the `ceiling_hook` slot at height 0. On 2026-10-21 the owner and an agent placed decor blocks with `/setblock` on the dev server (BDS 1.26.52, Bedrock client on a phone) and compared screenshots. Once the room blocks no longer hid the decor (0101):

- The planter rendered as an unshaped full block with a dirt-like fallback texture, anywhere it was placed
- The same model moved down to start at y = 0 rendered correctly
- Every standing decor model starts at y = 0 and rendered correctly with the `yasu_ride:face` and `yasu_ride:height` `minecraft:transformation` permutations (faces 0 to 3, heights 0, 8, and 12)

So the client needs a block model's lowest cube at the bottom of the cell. The 29 px model of 0093 most likely failed for this reason too, not because of its height.

## Decision

- Every camping gear model starts at y = 0 and stays within 0 to 16 px of its cell. A hanging item's model goes from 0 up to its height, like a standing item's
- A hanging item is lifted to the hook by its slot's `yasu_ride:height`: the `ceiling_hook` slot's height is 16 minus the hanging items' height. With the 10 px planter it is 6, so the planter shows from 6 to 16 px, with its top knot at the top of the cell where the camper model's cord ends (0099)
- All hanging items share one height. A test fails if a hanging item's height plus the hook slot's height is not 16
- A slot says that it is for hanging items (`hanging` on `DecorSlot`). `slotsFor` reads it instead of the furniture kind
- The decor block's selection box covers its model from 0 to its height, and the translation lifts it with the model
- The furniture block laid in the empty hook cell keeps `yasu_ride:height` 0 and its hanging box (x and z -4 to 4 px, y 6 to 16 px; 0097, 0099)
- This replaces 0099's "a hanging item's model ends at the top of its cell", "the `ceiling_hook` slot keeps height 0", and "the planter gets 6 to 16" for the decor block's selection box, and 0093's height 0 for `ceiling_hook`. The camper model's cord and hook of 0099 stay

## Consequences

- The planter renders as a planter, at the same place as 0099 intended
- `tests/packs/blockGeometry.test.ts` (0101) checks every block model with no exception
- The hook slot's surface point used by the nearest-slot rule moves from the cell bottom to 6 px up. Only hanging items use that slot, and there is one hook, so no placement changes
- A taller hanging item needs a lower hook height for every hanging item, or a second hook slot
- Check on a phone and on PC that the planter shows as a planter under the hook, that the cord meets its top knot, and that aiming at it outlines it
