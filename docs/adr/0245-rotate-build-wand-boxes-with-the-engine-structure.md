# 0245. Rotate Build Wand boxes with the engine structure

- Status: Proposed
- Acceptance condition: Accepted when the last pull request of the rotation series (rotating a selected box in place) merges and the unverified findings below are filled in
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

A spike on the dev BDS (2026-11-10, `@minecraft/server` 2.11.0, throwaway code discarded) established the facts below. Rows marked `unverified` are filled in by the in-game scenarios of the store pull request (3/7).

| Fact                                                    | Result                                                                                                                                      |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Rotation option                                         | `world.structureManager.place(id, dim, location, { rotation })` with `StructureRotation.Rotate90`, `Rotate180` or `Rotate270`               |
| Preserved under rotation                                | chest and barrel items, standing and wall sign text, spawner, both bed halves, stairs, furnace, log axis                                    |
| Orientation under Rotate90 (clockwise from above)       | chest and furnace north to east, wall sign east to south, `ground_sign_direction` 4 to 8, log axis x to z, stairs `weirdo_direction` 2 to 1 |
| Cell mapping under Rotate90                             | for a box of size (sx, sz), source (x, z) lands at (sz - 1 - z, x), measured from the placement location                                    |
| Anchor                                                  | the rotated structure's minimum corner is the placement location, so the footprint becomes sz x sx at the same corner                       |
| Size limit                                              | 64 x 64 x 64 and 1 x 65 x 1 succeed; X or Z above 64 throws `Structure size exceeds the maximum of 64x384x64.`                              |
| Capture time                                            | 64 x 64 x 64 took 24 ms                                                                                                                     |
| Doors                                                   | unverified                                                                                                                                  |
| Entities (item frames, paintings, mobs)                 | unverified                                                                                                                                  |
| Placement time for large boxes                          | unverified                                                                                                                                  |
| Placing over existing blocks writes the structure's air | unverified; Phase 2 assumes it does                                                                                                         |

## Decision

1. Rotation is horizontal quarter turns only, clockwise seen from above, 90 degrees per step.
2. The rotation is done by `StructurePlaceOptions.rotation` in the structure store. The code never contains block-state rotation tables.
3. Phase 1 rotates the clipboard while aiming a paste. The aim holds a quarter-turn count (0 to 3) that persists across continuous pastes until New copy or End pasting. The Paste menu gains a Rotate entry that opens a repeating rotate menu showing the current heading, with Rotate (one more quarter turn, then the menu opens again) and Done. Escape counts as Done and keeps the turn. Odd turns swap the X and Z sizes of the outline and the target box; the anchor stays the minimum corner. `BuildStructureStore.place` gains a rotation argument.
4. Phase 2 rotates a selected box in place about its center, from a Rotate entry in the shape menu on a confirmed box. The new box has size (sz, sy, sx). Cells of the new box outside the old box are overwritten, including terrain, water and neighbors. The operation is refused with a message and no change only when a cell of the union of the old and new boxes fails `mayEdit`, or when max(sx, sz) exceeds 64 or the max(sx, sz) by max(sx, sz) footprint times the height exceeds `BUILD_SPEC.maxCopyVolume`. The undo snapshot covers the union box, so Undo restores the overwritten cells. The order is: capture the snapshot, capture the source, clear the old box, place rotated, record the snapshot; any failure restores the snapshot. The new box stays the confirmed selection so Rotate can be pressed again.
5. Center rule: `newMin.x = oldMin.x + trunc((sx - sz) / 2)` and `newMin.z = oldMin.z + trunc((sz - sx) / 2)`, where trunc rounds the half-cell offset toward zero; Y is unchanged. A turn swaps the sizes, so the offsets of two consecutive turns are exact negatives of each other: two turns, and therefore four, return the box exactly, with no drift. A property test asserts that applying the rotation twice returns the original box.
6. Mirror, flip, stacking, vertical (sideways) turns and 45 degree turns stay out. A pasted region is not selected by paste; to rotate a pasted building the player selects it with two points.

## Consequences

- The single undo snapshot slot is replaced by a rotation, exactly as a paste or a cut replaces it. The spec says so.
- Entities with a `yasu_ride:` or `yasu_build:` identifier are excluded from structures and are not moved, as in 0243. Item frames, paintings and mobs follow whatever the structure keeps today; if the probe shows they are lost or mis-turned, that is recorded as a limitation.
- Phase 2 overwrites blocks outside the old box by design. This is acceptable only because the undo snapshot covers the union box.
- Revisit if the engine raises or changes the structure size limit, if placement over existing blocks does not write air, or if a faster input for rotating while aiming a paste is wanted.
