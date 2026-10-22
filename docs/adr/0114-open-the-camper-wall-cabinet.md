# 0114. Open the camper wall cabinet

- Status: Accepted (extended by [0120](0120-doored-storage-in-the-camper.md): the wall cabinet is the first definition of doored storage)
- Date: 2026-10-22
- Supersedes in part: 0103 (the wall cabinet's 7 px height and "it has no decor slot")
- Extends: 0068 (the ceiling cells), 0094 (a door swung by an entity property), 0105 (one toggle per swing), 0108 (a pair block per furniture cell), 0113 (the window under the cabinet)

## Context

The owner wants the wall cabinet over the counter and the stove to open and close and to hold decor inside (#426). Decided with the owner:

- The two doors open separately: a tap opens or closes the door that was pressed.
- Each door's compartment holds two items, four in all.
- A closed door hides the items behind it. Items can be placed or taken out only while that door is open.
- An empty-hand tap on a door toggles it, once per tap (0105). Holding gear and pressing an open compartment places the item; an empty-hand tap on an item inside takes it back, as on other decor.

Facts this decision builds on:

- Since 0103 the cabinet is drawn only by the camper model, 7 px high from model y 54 to the ceiling plate at 61, over the sink cell (local z -1) and the stove cell (z -2). Those model heights are in the room's ceiling layer, layer 3 (model y 48 to 64), not layer 2: the ceiling plate is at the top of layer 3 (0068). Both cabinet cells held `yasu_ride:camper_ceiling`, whose collision and selection boxes are its top 3 px. A press on the cabinet reached nothing the scripts handle
- The counter window of 0113 reaches model y 49, and its curtains end at y 50
- The standing items are at most 8 px high (0093), and a shelf board's two items stand 3.5 px either side of the cell middle, 1 px apart (0108)
- A cell holds one block, a block's transformed geometry must keep at least 1 px in its own cell on each axis, and a geometry must start at y 0 (0101, 0108). One block cannot mix opaque and blending materials, and an enum state needs two or more values (0108)
- The shower-toilet door is a model bone swung by a float entity property, 0.1 per tick, with its swing restored after a reload (0094). The camper had 10 entity properties; an entity can declare up to 32
- One tap can reach a block twice, 3 to 4 ticks apart, both as a first event (0105)
- Block geometry `bone_visibility` takes Molang with `q.block_state` (0108), and the room blocks are relaid every tick from the drive's wanted cells, so a state can follow the drive (0068, 0096)

## Decision

### The model

- The cabinet hangs from the ceiling plate down to model y 50, clear of the window's top at 49: a floor from 50 to 51, a top panel from 60 to 61, a back against the wall, its two ends, and a divider at z 24, the edge between the sink and stove cells. Each compartment spans its cell, so its middle is its cell's middle. Inside, a compartment is 9 px high, over the tallest item
- Each door is its own bone, a child of `body`: `cabinet_sink_door` (z 9 to 23.6) and `cabinet_stove_door` (z 24.4 to 39), 0.5 px thick on the cabinet's aisle face, with a chrome pull low on the free edge. Each is hinged at the cabinet's outer end on the aisle face, the sink door at z 9 and the stove door at z 39, so the two open doors stand at the cabinet's ends, in the aisle cells beside their compartments, above head height
- Two float entity properties, `yasu_ride:cabinet_sink_door` and `yasu_ride:cabinet_stove_door` (0 to 1, client synced), swing the doors up to 90 degrees into the aisle: +90 for the sink door, -90 for the stove door, which is hinged like the shower door. The camper then has 12 properties. Both are restored after a reload like the shower door's (0094). The bones and properties extend the camper's bone contract (0009) and its entity contract (0067)

### The blocks

- Each compartment's cell, local (-1, -1) and (-1, -2) in layer 3, holds `yasu_ride:cabinet_decor_pair` while the camper is parked, full or empty, in place of the ceiling block. The room's 107 cells become 105, and the cabinet cells are slot cells: the parking check still reads 168 cells, and departure reads 49 cargo cells, 12 slot cells, and 2 exit cells, 63 in one batch, and accepts air, the furniture block, or the cabinet block in a cabinet cell
- It is a pair block (0108): one bone per standing item per end at the shelf boards' end spots (`DECOR_SPOTS` 5 and 6, 3.5 px either side of the cell middle along the camper), the end states `yasu_ride:end<n>_page` and `yasu_ride:end<n>_item`, and `yasu_ride:face`. A third state, `yasu_ride:open` (false, true), joins every bone's visibility, so a shut compartment shows nothing. Its one height, 3 px, is no state; each face's permutation turns the block and lifts it by 3 px
- Its boxes are given before that lift: the selection box covers the cell from 0 to 10 px, so from the compartment floor to the top of the doors once lifted, and the collision box covers 10 to 13 px, the ceiling plate's top 3 px once lifted. Both boxes are full cell squares, so the turn by the face leaves them where they are. If the client did not move boxes with the lift, both would still be inside the cell: the selection box over the cabinet and the collision 3 px under the ceiling
- `open` is true while the door is open or still swinging shut, so the items show from the tick the door starts to open until the tick it is shut. The door swings before the cells are built on each tick
- While a door is open, its aisle cell, local (0, -1) or (0, -2) in layer 3, holds `yasu_ride:camper_cabinet_door` instead of the ceiling: an invisible block with the ceiling's collision and a selection box that is a 2 px plate over the cell's width, from 2 to 13 px up, on the side of the cell where that door's hinge is (`yasu_ride:face`, the same plate faces as the shower-toilet's block, 0098). The open door stands there
- Both blocks carry the custom component `yasu_ride:camper_cabinet`. `tools/gen_camping_gear.py` writes the compartment block and its geometry with the other pair blocks (`PAIRS`); the door block is written by hand like the other room blocks

### Slots and presses

- The wall cabinet is a furniture row, listed last, with four slots, two per compartment, each naming its door: `cabinet_sink_rear` and `cabinet_sink_front` behind the sink door, `cabinet_stove_rear` and `cabinet_stove_front` behind the stove door, 3 px high, at spots 5 and 6, as the pair ends `{ kind: "cabinet", end: 0 or 1 }`. The ids differ from 0093's `wall_cabinet_front` and `wall_cabinet_rear`, which stay unknown so their saved items keep moving as 0103 says
- A slot behind a door takes an item only while that door is open, in the nearest-free-slot rule, the pressed-cell rule, and placing (`slotsFor`, `nearestFreeSlot`, and `slotForPress` take the open doors). Held gear pressed on a shut compartment goes to the free spot nearest the press elsewhere, or shows "No free spot for this item"; an exact press never reaches the cabinet
- An empty-hand press on either block goes to `PressCabinet`, which asks the vehicle (`pressCabinet`), with the pressed cell and point:
  - On a door's plate in the aisle, the door shuts
  - On a shut compartment, its door opens
  - On an open compartment, the item at the end nearest the pressed x and z is taken back into the player's inventory, as on a pair block (0108). When that end is empty, the door shuts, so a player can shut a compartment from either its door or its empty half
- A press within one swing (`CAMPER_SPEC.doorSwingTicks`, 10 ticks) of that door's last action does nothing, whatever it would have done, as 0105 does for the other doors. Otherwise the echo of a tap that opened the door could take an item out at once, and the echo of a tap that took an item could shut the door. Each door keeps its own window
- `removeDecor`, behind the decor blocks' component, never takes a cabinet item
- Departure shuts both doors at once, and the next park lays them shut. The items stay saved in the decor property as before and are laid again on the next park
- Saved decor whose slot no longer exists may move into a cabinet compartment, shut or not, once every other free slot is taken (0103). It is kept there, out of sight until the door opens, instead of being stowed out of reach

## Consequences

- Each door opens and closes on its own with one tap; each compartment holds two items, shown only while its door is open or swinging shut
- The cabinet now reaches 4 px lower, to model y 50, still above the window and, at 34 px over the floor, above a standing player's head
- The press reaches the camper anywhere on the cabinet; a shut cabinet takes no gear, so a press on it with gear in hand puts the item elsewhere, usually on the stove or the counter under it
- A compartment with both items in it is shut from its door in the aisle, or after taking one item out
- The open doors' plates stand in the aisle under the ceiling at the cabinet's two ends. A press from the entry door aimed past the open sink door at the stove compartment reaches the sink door's plate and shuts that door first
- Every new block needs a server restart, and the Resource Pack changes (the camper model, the animations, the new geometry), so its version goes up (0015)
- Check in game, on a phone and on PC:
  - that the cabinet block renders its items only while the door is open, in all four facings, and never as the fallback block
  - that both boxes move with the 3 px lift: aiming at the cabinet outlines it from its floor to its top, and a player jumping under it hits the ceiling, not the cabinet's middle
  - that a door's plate catches a tap on the open door, and that no tap is taken twice
  - that the doors swing into the aisle, not into the wall, and stay above a standing player's head
