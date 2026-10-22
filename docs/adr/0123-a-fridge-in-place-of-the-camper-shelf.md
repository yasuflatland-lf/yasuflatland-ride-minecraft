# 0123. A fridge in place of the camper shelf

- Status: Proposed
- Date: 2026-10-22
- Supersedes in part: 0093 (the tall open shelf behind the driver), 0108 (the two shelf boards, their four slots, and the shelf's pair block as a laid block)
- Extends: 0115 (the front ceiling light's cell), 0121 (the fridge is the second unit of doored storage)
- Applies: 0009 (the bone contract), 0050 (per-unit parameters), 0067 (the entity contract), 0105 (one toggle per swing)

## Context

The owner sent a photo of a retro two-door mini fridge built into a camper counter and asked for the camper's two-board shelf to become that fridge at the same scale, with doors that open (#455). The photo shows a cream body with softly rounded edges, a shorter freezer door over a taller main door, a chrome strip between the doors, a chrome lever handle on each door, and a thin chrome line across the upper door. It has a brand badge, which the camper must not copy.

Issue #461 split the work in two. The first step, 0121, rebuilt the wall cabinet's doors as a shared mechanism, "doored storage", with no change in behavior, and set out what a second unit such as the fridge would supply. This ADR is the second step.

Facts this decision builds on:

- The shelf stands behind the driver in local cell x -1, z 1, model x 9 to 22.4, z -23.5 to -8.5, and y 16 to 49. Its two boards are the slot cells (-1, 1) in layers 1 and 2, with two slots each at the boards' end spots 5 and 6, 10 px and 4 px up, drawn by `yasu_ride:shelf_decor_pair` (0108). Their ids, `shelf_low`, `shelf_low_front`, `shelf_high`, and `shelf_high_front`, are saved with the decor
- The aisle cell (0, 1) in layer 1 is where the front dinette seat's rider stands up (0109), and the same cell in layer 2 is the front ceiling light's cell (0115)
- The front wheel arch's housing inside the room rises to model y 18.4 in the shelf's back front corner. The shelf's closed base hid it
- A block state holds at most 16 values, a block fewer than 65,536 combinations of its states, and an entity at most 32 properties. The camper had 11 properties
- A rendered close-up of the first, direct attempt (branch `wip/camper-fridge-direct`) matched the photo, so its model and blocks are reused here. Its code, which added "cabinet or fridge" branches to the cabinet's code, is not

## Decision

### The fridge is a doored storage unit

- `FRIDGE` in `src/domain/vehicle/kinds/camper/furniture.ts` is a `DooredStorage` with pair kind `fridge`, listed after `WALL_CABINET` in `CAMPER_STORAGE`. Its furniture row, `fridge`, comes last in `CAMPER_FURNITURE`, after the wall cabinet's, so saved decor that loses its slot fills every open spot before a closed compartment (0103, 0121)
- It has two doors, bottom first:
  - `fridge_bottom`: compartment (-1, 1) in layer 1, plate (0, 1) in layer 1, slots `fridge_bottom_rear` and `fridge_bottom_front` 3 px up, on the bottom panel
  - `fridge_top`: compartment (-1, 1) in layer 2, plate (0, 1) in layer 2, slots `fridge_top_rear` and `fridge_top_front` 4 px up, on the divider
- Both doors hinge at the fridge's front end (`hinge` 1), so an open door stands across the aisle cell beside the fridge at its front edge, against the front seats' backs, and leaves the way from the entry door to the compartments free. Each compartment holds two items at the boards' end spots 5 and 6, behind its door
- The fridge supplies only what 0121 lists:
  - door ids `fridge_top` and `fridge_bottom` in `StorageDoorId`, and their float entity properties `yasu_ride:fridge_top_door` and `yasu_ride:fridge_bottom_door` (0 to 1, client synced, restored after a reload as the cabinet's are) in `STORAGE_DOOR_PROPERTY`. The camper now has 13 properties
  - the dock blocks `fridge` (face, height, open, two ends) and `fridgeDoor` (face, lit) in `DockBlock`, with their `sameBlock` cases, in the storage block unions, and in the infrastructure's saved-cell check, block id, and permutation
  - pair kind `fridge` in `StoragePairKind` and in the infrastructure's `PAIR_KINDS`, a row in `faceHeight.ts`, and `yasu_ride:camper_fridge_door` among the camper room blocks
  - `RENAMED_SLOTS` entries: `shelf_low` loads as `fridge_bottom_rear`, `shelf_low_front` as `fridge_bottom_front`, `shelf_high` as `fridge_top_rear`, and `shelf_high_front` as `fridge_top_front`, the same end in the same cell, as the stove's renamed slots load (0112). The items are then out of sight until the door opens
- The swing, the one toggle per swing, the press routing, the inside-layer plates, the lit plate, the park check, the departure read, the shut doors on departure, and the restore all come from the shared code of 0121. Neither `dooredStorage.ts`, `room.ts`, nor `drive.ts` changes

### Blocks

- Each compartment cell holds `yasu_ride:fridge_decor_pair` while the camper is parked, full or empty. `tools/gen_camping_gear.py` writes it from a `PAIRS` row: the shelf's end offsets, heights 3 and 4, and the states `yasu_ride:face`, `yasu_ride:height`, `yasu_ride:open`, and each end's page and item, 4 × 2 × 2 × 20 × 20 = 6,400 combinations. `yasu_ride:open` joins every bone's visibility, as on the cabinet's block. It has no collision, as the shelf had none, and the storage component `yasu_ride:camper_cabinet`. Each permutation lifts it by its height and gives it a selection box from 0 to 16 px minus that height, so once lifted the box runs from the compartment floor to the top of the cell
- In `tools/gen_camping_gear.py`, a pair row's `door` names how its compartment's boxes are laid instead of being a flag: `ceiling` for the wall cabinet, which keeps its exact block file, and `cell` for the fridge. Each row's `inside_px` is its compartment's inside height, 9 px for the cabinet and 12 px for the fridge's upper compartment, and the script refuses a standing item taller than either
- While a fridge door is open, its plate cell holds `yasu_ride:camper_fridge_door`: an invisible block without collision, selectable by a 2 px plate the full height of the cell on the hinge side (`yasu_ride:face`, the shower-toilet's plate faces). Its `yasu_ride:lit` state gives light 15, as `minecraft:light_block_15` does. The top door's plate takes the front ceiling light's cell and is lit while the lights are on, and the light block is not laid while it stands there (0115, 0121). It is written by hand like the other room blocks
- The shelf's pair block stays defined, with its old heights, though no slot lays it: a block an older build laid keeps its type, so the saved cells still clear it and the next lay replaces it with the fridge's compartment block. `pairHeights("shelf")` is now empty, so the scripts would lay it without a height state; they never lay it

### The model

- `tools/gen_camper.py` replaces the shelf with the fridge at the same footprint and height: model x 9 to 22.4, z -23.5 to -8.5, y 16 to 49. Its body is cream (`ivory`) with each outer edge stepped in by 0.4 px, which reads as a rounded edge. Inside, a white liner: a 3 px bottom panel up to y 19 over the wheel arch's housing, a divider from 35 to 36, and the back. The top panel is 48 to 49
- Two doors, each its own bone and a child of `body`: `fridge_top_door` from y 35.8 to 48.6 and `fridge_bottom_door` from y 16.5 to 35.2, so the top door is the shorter one. Each is a cream slab with a face plate inset by 0.4 px and a chrome lever handle by its free edge, toward the entry door; the top door also has a thin chrome line across its upper part. A chrome seam strip runs across the divider between the doors. No badge, name, or lettering
- Both doors pivot at model (-8.3, 0, -23.3) in the game's frame and turn by `q.property(...) * 90`, the way the cabinet's sink door turns, since both are hinged at their front ends. The client entity animates both, and the render controller needs no change. The bones extend the camper's bone contract (0009)

### Riders and presses

- A rider standing up from the front dinette seat into (0, 1) stands through an open fridge door's plate, which has no collision: `deckSeats.ts` counts a room block that `isStandableRoomBlock` names, only `yasu_ride:camper_fridge_door`, as open, like air and a light block (0109). This is the one change outside the fridge's own pieces. It names a block, not the fridge, so a later collisionless plate joins the same list
- The fridge's compartments take and give items only while their doors are open, as the cabinet's do (0114, 0121)

## Consequences

- The shelf behind the driver is a cream two-door fridge of the same size. Each door opens and closes on its own with one tap, and each compartment holds two items, shown only while its door is open or still swinging shut
- Items saved on the shelf are kept, at the same ends, inside the shut fridge
- The two aisle cells the doors open into, (0, 1) in layers 1 and 2, leave the cargo cells, which become 47. The parking check still reads 168 cells, those two among them. Departure reads them in the same batch: 47 cargo cells, 12 slot cells, the 2 plate cells, and 2 exit cells, 63 in all. A player's block in either cell keeps the camper parked, as it did when the cell was cargo
- A press with gear on the shut fridge puts the item elsewhere, usually on the dinette or the dashboard
- The open doors stand in the aisle cell next to the fridge, against the front seats' backs. A press from the aisle aimed past an open door at the driver's seat, the dashboard, or the passenger seat reaches the door's plate and shuts that door first, as the door is in the way there
- The bottom door rises 3.2 px into layer 2, under the top compartment's box, which starts at its floor 4 px up. A press on that strip, or on the lowest 2.5 px of the bottom door, reaches neither compartment. The rest of each door's face reaches its own compartment
- Every new block and the entity properties need a server restart, and the Resource Pack changes (the camper model, the animations, the client entity, the compartment block's geometry), so its version goes up to 0.1.103 (0015)
- Check in game, on a phone and on PC (docs/manual-test.md C152 to C158):
  - that the doors open into the aisle toward the cab, not into the fridge or the wall, in all four facings, and that both compartments render their items only while open, never as the fallback block
  - that BDS loads the plate block's `minecraft:light_emission` in a permutation, and that the front of the room stays lit while the top door is open with the lights on
  - that a press on each door's face reaches its compartment, and a press on an open door reaches its plate
  - that the front dinette seat's rider stands up in the aisle with the bottom door open, and that the camper drives off with a door open
  - that an item saved on a shelf board before the update shows up in the fridge when its door opens
