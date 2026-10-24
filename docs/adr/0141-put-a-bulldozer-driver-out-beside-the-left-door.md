# 0141. Put a bulldozer driver out beside the left door

- Status: Proposed
- Date: 2026-10-24
- Extends: [0109](0109-stand-up-inside-the-parked-camper.md), [0136](0136-bulldozer.md)

## Context

The owner reports that getting out of the bulldozer puts the driver behind it and asks to stand outside the left door (#581). The engine chooses the first free spot around the entity a rider leaves; the stable Script API has neither a dismount event nor a dismount position in `minecraft:rideable` (0109). Seat 0 is at `[0, 1.4, -1.35]`, while the collision box is 2.4 blocks wide and deep. The seat is therefore 0.15 blocks behind the box's rear face. The nearest free spot being behind the vehicle is inferred from that geometry and the engine rule, not measured. The fix moves the player after the engine places them, wherever that was.

The generator mirrors x into the Bedrock frame, where positive x is left. The `door_l` cubes span x 3.6 to 14.6 pixels and model z 6.0 to 17.2 pixels; model front is negative z. The rear hinge is at `[12.1, 0, 15.3]`. At yaw 0 the bulldozer faces world +z, so its left is world +x. The body follows its head (0136).

## Decision

- Add optional, kind-neutral `VehicleProfile.seatExits`, one local point per seat, with x left-positive and z forward-positive (0050). An absent array or undefined entry keeps the engine's spot. Only the bulldozer opts in.
- Set the bulldozer's `doorExit` to `{ x: 1.75, z: -0.7 }` and give seat 0 that exit. The track's outer edge is 18.8/16 = 1.175 blocks from the center. A player's half width is 0.3, so their near edge at x 1.45 clears the track with a margin. The open door turns -70 degrees and reaches about x 1.01, z -0.31 at its free edge. The exit clears it, lies beside the middle of the door's z span, and stays behind the blade, which starts at z +1.0.
- For each leaving rider whose seat has an exit, return their player id and the world exit in seat order. Use the vehicle's location before this tick's move (or its dock hold's x, y, z), and the drive's yaw after the step. `applyMotion` turns the entity before placement, while the impulse moves it on the engine's next tick.
- After the final commands, including the door command, the application asks the world to stand each rider at their exit. The adapter looks up the vehicle and player and delegates to 0109's guarded `standUp` with an outdoor spot check in place of the camper's open-cell check, which the deck seats keep.
- Move only a valid, living player who rides nothing, is in the vehicle's dimension, and is within 6 blocks of it (0109), and only to a spot the outdoor check accepts. A missing vehicle or player or any failed check keeps the engine's already checked spot.
- The outdoor check looks at every column the player's 0.6-wide box overlaps, up to four, in the feet and head rows. Each cell must be air, a light block, a carpet, a low snow layer (height state 3 or less, at most half a block), or a passable decoration from the parking list (0068, 0119) other than a sweet berry bush, which hurts and slows. The cell under the middle of the feet must be ground: not air, a liquid, or one of those passable blocks. A ledge, a pit, a shore, or lava beside the door therefore keeps the engine's spot, and so does getting out in flight.
- The feet row is the row of the vehicle's feet height. When the tracks stand at least half a block up inside a lower-than-full block (a dirt path, farmland, mud, soul sand, or a bottom slab, 0136) and that row beside them holds ground, the check moves up one row and the player stands on top of that row.

## Consequences

The engine still places the player first, so for one tick they may stand behind the bulldozer before the teleport, as 0109 notes for the camper. While the bulldozer moves, the driver lands up to one tick's travel (0.45 blocks at top speed) from the door because the spot uses the location before the move. The player's view is preserved. The SUV, camper, and sports boat are unchanged.

The outdoor check searches no farther than one row up and one row down. On a step or a slope beside the door, or with only the edge of the player's box over ground, the player keeps the engine's spot behind the bulldozer, which is safe but is the spot the owner reported. A block outside the passable list that has no collision, such as a torch or a sapling, also keeps that spot.

Property tests check the exit transform, rider transitions, and the outdoor check; adapter and application tests check guarded delegation and command order. The in-game `bulldozer_exit_spot` scenario checks the point against the real entity's forward and left at four headings, and `bulldozer_exit_ground` runs the outdoor check on real stone, short grass, snow layers, a dirt path, a ledge, and water. There is no simulated player to dismount, so the stand-up itself is checked by hand on PC and touch (B23).
