# 0098. A block for the camper's shower-toilet

- Status: Accepted
- Date: 2026-10-21
- Supersedes in part: 0093 (the floor-tap trigger of the shower-toilet), 0094 (the floor-tap trigger of the shower door and the shower)
- Extends: 0068, 0095

## Context

0094 opened the shower-toilet door and ran the shower from an empty-hand press on the room's floor block under the shower-toilet, caught by 0093's `playerInteractWithBlock` before-event handler, and said to move these presses onto blocks of the shower-toilet's own once it had them. In the v0.12.0 play test the door never opened. The compact toilet deck seat of 0095 stands over that floor, and a press reaches a block only when the player's aim hits the block before any entity, so most presses hit the seat and showed "Ride". The floor block could also be broken in Creative (0096).

In local x (left positive) the shower-toilet cell spans -1.5 to -0.5, and the aisle is at x greater than -0.5. The compact seat's 0.5 wide box is centered at x -1.031, from -1.281 to -0.781. The model draws the shower door on the cell's aisle face (x 8 to 8.6 px in `tools/gen_camper.py`).

## Decision

- A new room block, `yasu_ride:camper_shower_toilet`, is laid in both shower-toilet cells (local x -1, z -3, layers 1 and 2) while the camper is parked, like the bed's block (0092). It is invisible, cannot be mined or blown up, has no collision, and has the state `yasu_ride:face` (0 to 3), which is set to the side of the cell toward the aisle
- Its only selection box is a 2 px plate on that face, over the full 16 px height of the cell, which is where the model draws the shower door. Any ray from the aisle into the cell crosses that face, so it hits the plate (-0.625 to -0.5) before the toilet seat (-1.281 to -0.781). From inside, the toilet seat still takes a press aimed at the toilet
- The block has the custom component `yasu_ride:camper_shower_toilet`. On `onPlayerInteract` with an empty hand, it finds the parked vehicle that laid the pressed cell. It runs `UseShowerDoor` when the player's feet are outside the pressed cell's block column, and `RunShower` when they are inside. Both use cases are 0094's, unchanged
- A press with any item in hand does nothing to the door or the shower. Camping gear is still caught by 0093's before-event handler, which cancels the press and places the gear in the nearest free slot, because the block is a camper room block
- The floor-tap path of 0094 is removed: the before-event handler no longer looks at empty-hand presses, and `TapDockFloor`, the floor owner lookup, and the drive's floor tap are deleted
- The door swing, the shower, their timing, and their reset on departure stay as in 0094

## Consequences

- The room lays 2 more cells, and the 2 shower-toilet cells are no longer cargo cells, so a player's block can no longer stand there
- Pressing the shower-toilet with a held block no longer places it inside the shower-toilet; the block's custom component makes players sneak to place a block against the plate, as on a chest
- A press from the aisle that enters the cell diagonally through the counter cell, not through the aisle face, misses the plate. It hits the toilet seat or the floor, and the floor no longer does anything
- A player inside the cell whose eyes are within the 2 px plate cannot press it; they step back from the door first
- Check on a phone and on PC that pressing the shower-toilet from the aisle toggles the door at any height, including aimed low at the toilet, and that pressing the door side from inside runs the shower. If the toilet seat still takes presses from the aisle, revisit the plate's depth before release
