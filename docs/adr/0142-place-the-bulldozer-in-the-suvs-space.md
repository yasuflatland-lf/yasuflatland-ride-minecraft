# 0142. Place the bulldozer in the SUV's space

- Status: Proposed
- Date: 2026-10-24
- Extends: [0136](0136-bulldozer.md)

## Context

The owner reports that the bulldozer cannot be placed on a rock or in a narrow spot, and asks to place it on the same terrain, in the same space, and with the same room as the SUV. 0136 gave the bulldozer a placement clearance of 9 x 9 cells (`halfX` and `halfZ` 4), sized to the blade's 4.64-block width. A single raised block, a wall, or a tree within four cells of the clicked block then made `canPlaceAt` fail, and the item was left unconsumed with no message.

`tests/packs/placementClearance.test.ts` checks the clearance against the entity's collision box, not the model. The bulldozer's collision box is 2.4 wide and 2.9 high, so 3 x 3 cells are enough horizontally and 3 cells vertically.

## Decision

- Set the bulldozer's placement clearance to `halfX` 1, `halfZ` 1, and height 3, the SUV's 3 x 3 footprint. The height stays at the 3 cells that hold the 2.9-high collision box; the SUV needs 2. The surface stays the top face of a block.
- Leave the blade and tracks, which are model only, out of the check. They may overlap a nearby wall at placement, as the SUV's mirrors can.

## Consequences

The bulldozer can be placed wherever the SUV can, except in spaces between 2 and 3 blocks high. Placing it next to a block may leave the blade inside that block until the driver backs away; the collision box is unchanged. `isVehicleSpace` (0122) still keeps another vehicle's footprint clear.
