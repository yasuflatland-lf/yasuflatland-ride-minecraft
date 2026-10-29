# 0182. A bunk bed in the parked camper

- Status: Proposed
- Date: 2026-10-29
- Extends: 0092 (the parked camper's bed)
- Supersedes in part: 0092 (the spawn point is no longer the pressed bed cell, and the cells above the lower bed are no longer interior cargo cells)

## Context

The owner wants two players to have separate beds and respawn points in the parked camper, with an upper bunk in the existing bed's space. The [approved design](../designs/2026-10-29-wide-blade-road-paver-bunk-bed.md) chooses the level by aim and puts each spawn in the aisle because neither mattress leaves enough standing headroom.

The existing code provides these building blocks:

- `CAMPER_FURNITURE`, `Furniture`, `FurnitureBlock`, and `LocalCell` in `src/domain/vehicle/kinds/camper/furniture.ts` describe the lower bed's two cells and `{ type: "bed" }` block. `roomCells` in `room.ts` derives the laid room from that table; `DockBlock` in `src/domain/vehicle/dock/floor.ts` carries the block choice to infrastructure.
- `registerBedBlock` in `src/infrastructure/shared/bedBlock.ts` and `SleepInBed` in `src/application/shared/sleepInBed.ts` share the sleep flow. `CAMPER_BED_COMPONENT` registers `yasu_ride:camper_bed`; `BedrockBedWorld.setSpawnPoint` currently uses the pressed cell (0092). Tent mattresses share that behavior (0133).
- `Drive` is the kind-neutral contract, and `dockCellOwner` finds the parked owner of a room cell. These provide the route to ask the camper for a spawn cell without putting camper rules in shared infrastructure.
- `tools/gen_camper.py` draws the existing bed from `BED`. The room tests currently count 105 room cells, 47 cargo cells, and 168 parking checks; 0092's older 61 cargo cells plus 2 exit cells no longer describe the live layout.

## Decision

1. **Spawn lookup (14/16).** A press on a camper bed block asks the camper which cell to use as the spawn point (owner lookup plus `Drive.bedSpawnCell`). The camper answers from its furniture table: a furniture row may carry an optional `spawn` cell (absent = the pressed cell), and `bedSpawnCell` finds the row whose block type is in `SLEEP_BLOCKS` and one of whose cells was pressed. There is no second bed table. Behavior is unchanged at first; the existing bed row has no spawn override in this refactor.
2. **Model (15/16).** The model gains a `bunk` bone over the bed: a thin upper deck with a mattress and slim posts, inside the two cells above the bed.
3. **Furniture and block (16/16).** Add furniture kind `bunk` with cells `{x: 1, z: -2, layer: 2}` and `{x: 1, z: -3, layer: 2}`, block `{ type: "bunk" }` (a new `DockBlock` member), and spawn `{x: 0, z: -3, layer: 1}`. It is one furniture row right after the bed, with its block type listed in `SLEEP_BLOCKS`, laid as `yasu_ride:camper_bunk`: no collision, a selection box matching the upper bunk, and the reused `yasu_ride:camper_bed` component. A collision box would stop players standing on the lower bed (feet 0.5625, head about 2.36 above the floor; the upper cell starts at 1.0).
4. **Level and spawn points (16/16).** The level is chosen by aim. Each spawn point is the `spawn` of its furniture row: the lower bed sets the aisle cell `{x: 0, z: -2, layer: 1}`, the upper bunk `{x: 0, z: -3, layer: 1}`. Every sleepable camper row has a spawn, enforced by a furniture test, so the pressed-cell fallback is never reached for a parked camper's rows. `{0, -3, 1}` is also where the toilet seat's rider stands up (0109) and where the open shower door stands (model only, 0118); both are harmless.
5. **Cell counts (16/16).** Room cells grow from 105 to 107, cargo cells shrink from 47 to 45, and parking checks stay 168. The two cells above the lower bed leave the interior, so a block can no longer be placed on top of the lower bed. This replaces 0092's sentence "A block placed on top of the bed is in an interior cell, so it keeps the camper parked like any other block"; its 61 + 2 departure count is out of date.
6. **Shared behavior and scope (15/16, 16/16).** The tent mattress keeps spawning on its own cell (0133). No ladder or climbing is added. The driving model shows the bunk too (15/16). Both levels use the existing sleep flow (16/16): the bed press sets the spawn point, fades and skips the night when allowed, or shows "You can sleep only at night" otherwise (0092). All camper spawn and furniture rules live in the camper kind; shared code only asks the drive for the answer.

## Consequences

When the owner lookup finds no parked camper, infrastructure falls back to the pressed cell. A press on the upper bunk then sets the spawn point in the bunk's own cell, one block over the lower bed; the player respawns there and drops onto the lower bed. This is accepted as harmless and rare, because the bunk block exists only while the camper is parked.

Two players can choose distinct aisle spawn points without climbing or tracking which bed is taken. The upper bunk removes two cargo cells and leaves the lower mattress usable as a standing surface. Revisit the selection box if aiming at the upper level proves difficult on a phone.
