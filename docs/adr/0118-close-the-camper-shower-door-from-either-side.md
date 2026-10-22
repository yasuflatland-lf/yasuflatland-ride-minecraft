# 0118. Close the camper shower door from either side

- Status: Accepted
- Date: 2026-10-22
- Supersedes in part: 0098 (choosing between the door and the shower from the player's position alone)
- Extends: 0068, 0094, 0105

## Context

Issue #452, from play on an iPad: once the shower-toilet door was open, only taps on the doorway closed it. Taps on the open door panel itself did nothing.

The door is hinged on its rear edge at the aisle face (model x 8, z 54) and swings -90 degrees, like the stove cabinet door (0114). Open, the panel stands in the aisle cell, local (0, -3), from x -3.9 to 7.9 px and z 52.8 to 54 px. It spans from just above the floor to 51.9 px, which is 2 to 3 px in front of the rear wall plate (z 56 to 58). The side of the panel that faces the aisle is the side that faced into the shower-toilet while the door was shut. Nothing that a tap can hit stands where the open panel is drawn:

- The aisle cell holds cargo air, or the ceiling lights' light block in layer 2 (0115). Neither one can be selected.
- The rear wall block, `yasu_ride:camper_wall`, has no selection box (0068).
- The shower-toilet block's only selection box is the 2 px doorway plate (0098), and it stays there when the door is open.

So a tap on the open panel went through it to whatever stood outside the camper. The only way to close the door was to tap the empty doorway from the aisle.

0098 also chose between the door and the shower by the player's position alone: a press from outside the shower-toilet's column swung the door, and a press from inside ran the shower. From inside, an open door could not be closed at all. 0098 did not consider an open door.

The entry door and the wall cabinet doors do not have this problem. The open entry door's block fills its cell with its selection box, and the open panel stays in that wall cell's column. An open cabinet door stands inside its own aisle plate (0114). Neither one depends on where the player stands.

## Decision

- While the shower door is open (its target, as for the cabinet doors in 0114), the rear wall cells behind the aisle cell beside the shower-toilet, local (0, -4) in layers 1 to 3, hold a new room block, `yasu_ride:camper_shower_door`, instead of `yasu_ride:camper_wall`. When the door shuts, they go back to the wall
- The new block has the wall's state `yasu_ride:face` and its 2 px collision plate on that face. Its selection box is the same plate, and it has the shower-toilet's custom component, `yasu_ride:camper_shower_toilet`. Like the other room blocks, it is invisible and cannot be mined or blown up. A tap on the open panel goes on about 2 to 3 px past the panel and hits this plate
- The custom component no longer chooses an action. It passes the pressing player's feet to one use case, `PressShowerToilet`, and the camper decides from its door:
  - If the door is open, or it moved less than a swing ago (`CAMPER_SPEC.doorSwingTicks`, 0105), the press goes to the door, with 0105's rule that a door toggles once per swing. Without the swing check, the second event of a tap that shut the door from inside (3 to 4 ticks later, 0105) would find the door shut and start the shower
  - If the door is shut and the player's feet are outside the shower-toilet's column, the door opens
  - If the door is shut and the player's feet are inside the column, the shower runs, as in 0098
- `UseShowerDoor` and `RunShower` are replaced by `PressShowerToilet`

## Consequences

- An open shower door closes from a tap on either side of its panel or on the doorway, whether the player is in the aisle or inside the shower-toilet
- From inside, a shut door still cannot be opened by a tap, because that tap runs the shower. The door has no collision, so the player can walk out. To change this, the shower would need its own target
- To start the shower from inside with the door open, the player first taps once to shut the door and then taps again after the swing
- The room still lays 105 cells. While the door is open, three of its wall cells are the new block. Parking checks, cargo, and the wall-foot cells use the shut room and do not change
- The new block is in the Behavior Pack only, so the Resource Pack version does not change. A server restart is still needed to load the block (0015)
- Check on a phone and on PC: open the door from the aisle, then close it by tapping the face of the open panel. Open it again and close it from inside the shower-toilet by tapping the panel or the doorway. Also check that a tap from inside with the door shut runs the shower, and that the tap that shuts the door does not start the shower
