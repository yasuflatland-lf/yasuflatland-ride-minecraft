# 0245. Rotate Build Wand boxes with the engine structure

- Status: Accepted
- Date: 2026-11-10
- Supersedes in part: [0243](0243-copy-the-build-wand-box-as-an-engine-structure.md): the line that excludes rotation, flip and stacking, for horizontal quarter turns only
- Extends: [0243](0243-copy-the-build-wand-box-as-an-engine-structure.md)
- Related: [0001](0001-bedrock-addon-with-stable-script-api.md): stable API only
- Related: [0202](0202-build-wand-copy-and-continuous-paste.md): continuous paste
- Related: [0203](0203-build-wand-paste-aiming.md): paste aiming and its menu
- Related: [0229](0229-open-build-utilities-with-a-plain-air-press.md): build utility menus

## Context

The owner copies a furnished building (containers, signs, beds, doors, stairs, furnaces) and wants the copy turned to another heading, and also wants to turn an already selected building in place. A rotation that drops or mis-orients any block is not acceptable. The [design](../designs/2026-11-10-build-wand-rotate-design.md) has the full intent, goals and open risks.

Since 0243 the clipboard is an engine structure, so the engine can rotate it. Hand-written facing, direction, axis and hinge tables in the domain layer would be large, fragile and would drift from the engine.

### Findings

A spike on the dev BDS (2026-11-10, `@minecraft/server` 2.11.0, throwaway code discarded) established the facts below. The in-game scenario `build_structure_rotation` of the store pull request (3/7) asserts the rows marked "asserted by `build_structure_rotation`". The scenario passed on the dev BDS on 2026-11-10 with these assertions. Timing rows are measurements: the scenario logs them but does not assert them.

| Fact                                                    | Result                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rotation option                                         | `world.structureManager.place(id, dim, location, { rotation })` with `StructureRotation.Rotate90`, `Rotate180` or `Rotate270`; asserted by `build_structure_rotation`                                                                                                                           |
| Preserved under rotation                                | chest items in slots 0 and 13, barrel items, standing and wall sign text, spawner, both bed halves, stairs, furnace, log axis, at every turn; asserted by `build_structure_rotation`                                                                                                            |
| Orientation per quarter turn (clockwise from above)     | chest and furnace `minecraft:cardinal_direction` north, east, south, west; wall sign `facing_direction` 5, 3, 4, 2; `ground_sign_direction` 4, 8, 12, 0; log `pillar_axis` x, z, x, z; stairs `weirdo_direction` 2, 1, 3, 0; bed `direction` 0, 1, 2, 3; asserted by `build_structure_rotation` |
| Cell mapping per quarter turn                           | for a box of size (sx, sz), source (x, z) lands at (sz - 1 - z, x), measured from the placement location; all 140 cells of a 5 x 4 x 7 box matched at turns 0 to 3; asserted by `build_structure_rotation`                                                                                      |
| Anchor                                                  | the rotated structure's minimum corner is the placement location, so the footprint becomes sz x sx at the same corner and nothing lands outside it; asserted by `build_structure_rotation`                                                                                                      |
| Size limit                                              | 64 x 64 x 64 and 1 x 65 x 1 succeed; X or Z above 64 throws `Structure size exceeds the maximum of 64x384x64.` (spike; `build_structure_probe`)                                                                                                                                                 |
| Capture time                                            | 64 x 64 x 64 took 22 to 24 ms in the spike and 26 ms in `build_structure_rotation` (logged, not asserted)                                                                                                                                                                                       |
| Doors                                                   | `wooden_door` keeps both halves (`upper_block_bit`) and `door_hinge_bit` at every turn; both halves have `direction` 0, 1, 2, 3 and `minecraft:cardinal_direction` south, west, north, east; asserted by `build_structure_rotation`                                                             |
| Entities: mobs                                          | a cow inside the box is copied once per placement, its position follows the cell mapping and its yaw turns 0, 90, 180, 270; asserted by `build_structure_rotation`                                                                                                                              |
| Entities: item frames and paintings                     | unverified: `build_structure_rotation_decor` needs a logged-in player to hang them and has not been run                                                                                                                                                                                         |
| Placement time for large boxes                          | 64 x 64 x 64 placed in 380 to 396 ms in the spike and 368 ms in `build_structure_rotation` (logged, not asserted)                                                                                                                                                                               |
| Placing over existing blocks writes the structure's air | yes: every air cell of the rotated fixture replaced stone; asserted by `build_structure_rotation`                                                                                                                                                                                               |

## Decision

1. Rotation is horizontal quarter turns only, clockwise seen from above, 90 degrees per step.
2. The rotation is done by `StructurePlaceOptions.rotation` in the structure store. The code never contains block-state rotation tables.
3. Phase 1 rotates the clipboard while aiming a paste. The aim holds a quarter-turn count (0 to 3) that persists across continuous pastes until New copy or End pasting. The Paste menu gains a Rotate entry that opens a repeating rotate menu showing the current heading, with Rotate (one more quarter turn, then the menu opens again) and Done. Escape counts as Done and keeps the turn. Odd turns swap the X and Z sizes of the outline and the target box; the anchor stays the minimum corner. `BuildStructureStore.place` gains a rotation argument.
4. Phase 2 rotates a selected box in place about its center, from a Rotate entry after Copy and before Cancel in the endpoint shape menu. Horizontal rectangles use the same height step as Cut and Copy; other selections rotate immediately. The new box has size (sz, sy, sx). Cells of the new box outside the old box are overwritten, including terrain, water and neighbors. The operation is refused with a message and no change only when a cell of the union of the old and new boxes fails `mayEdit`, or when max(sx, sz) exceeds 64 or the max(sx, sz) by max(sx, sz) footprint times the height exceeds `BUILD_SPEC.maxCopyVolume`. The undo snapshot covers the union box, so Undo restores the overwritten cells. The order is: capture the snapshot, capture the source, clear the old box, place rotated, record the snapshot; any failure restores the snapshot. The new box stays the confirmed selection so Rotate can be pressed again.
5. Center rule: `newMin.x = oldMin.x + trunc((sx - sz) / 2)` and `newMin.z = oldMin.z + trunc((sz - sx) / 2)`, where trunc rounds the half-cell offset toward zero; Y is unchanged. A turn swaps the sizes, so the offsets of two consecutive turns are exact negatives of each other: two turns, and therefore four, return the box exactly, with no drift. A property test asserts that applying the rotation twice returns the original box. Negative zero is normalized. The height-step limit and `rotateTooLarge` both measure the union of the old and new boxes.
6. Mirror, flip, stacking, vertical (sideways) turns and 45 degree turns stay out. A pasted region is not selected by paste; to rotate a pasted building the player selects it with two points.

## Consequences

- Rotation snapshots share the per-player `BUILD_SPEC.undoDepth` (10) entry history with paste, cut and cell edits, as in 0243. Evict the oldest entry first and discard its structure handle when it is a snapshot.
- Entities with a `yasu_ride:` or `yasu_build:` identifier are excluded from structures and are not moved, as in 0243. Item frames, paintings and mobs follow whatever the structure keeps today; if the probe shows they are lost or mis-turned, that is recorded as a limitation.
- Phase 2 overwrites blocks outside the old box by design. This is acceptable only because the undo snapshot covers the union box.
- Revisit if the engine raises or changes the structure size limit, if placement over existing blocks does not write air, or if a faster input for rotating while aiming a paste is wanted.

`build_rotate_box` covers in-place rotation, furniture payloads, overwritten neighbors, snapshot Undo, repeated turns and union protection. It passed on the dev BDS on 2026-11-10. Manual BT38 and decoration rotation remain unverified.
