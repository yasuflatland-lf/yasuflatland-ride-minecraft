# Build Wand rotation design

Status: draft for the owner's review. Base all work on `origin/main`; the engine-structure copy, paste, cut and snapshot undo of [ADR 0243](../adr/0243-copy-the-build-wand-box-as-an-engine-structure.md) are already merged there.

## Intent

The owner builds a furnished building (a bungalow with a full interior), copies it, places the copy elsewhere and wants to turn the copy to a different heading. The interior contains every kind of block: containers with items, signs with text, beds, doors, stairs, furnaces. A rotation that drops or mis-orients any of them is not acceptable. If the current build tools cannot rotate correctly, refactor them rather than compromise.

## Goals

- Rotate a building by 90 degrees about the vertical axis, with block states, container contents, sign text and eligible entities preserved.
- Phase 1: rotate the clipboard while aiming a paste, so a copy can be placed already turned.
- Phase 2: rotate an already selected box in place, about the box center.
- Reuse the engine-structure store, snapshot undo, edit protections and size limits. No hand-written block-state rotation.

## Non-goals

- Mirroring or flipping, vertical (sideways) rotation, 45-degree turns, stacking.
- Rotating copy and paste at once with a different tool; Phase 1 and Phase 2 stay separate menu entries.
- Moving `yasu_ride:` / `yasu_build:` entities (hosted camp and resort gear); they keep today's structure-exclusion behavior.

## Anti-goals

- Overwriting blocks outside the selected box without the undo snapshot covering them.
- Dropping the interior blocks the current clipboard cannot hold (it no longer drops them since ADR 0243; rotation must not reintroduce that).
- Re-implementing facing, direction, axis or hinge state tables in the domain layer.

## Constraints

- Stable Script API only (ADR 0001); `world.structureManager` is stable.
- Layer and feature rules in `AGENTS.md`; the engine call lives in `src/infrastructure/build/bedrock/bedrockStructureStore.ts`, the port is `src/application/build/ports/structures.ts`.
- Engine structure size limit is 64 x 384 x 64 per axis (ADR 0243 probe). `BUILD_SPEC.maxCopyVolume` (32,768) still applies. `structureGeometry.ts` currently uses Y 256 ("not yet measured"); leave it unless this work needs the larger value.
- Add a new ADR (next number 0245, format per ADR 0205) that extends 0243 and supersedes in part its "no rotation" line. Update `docs/specs/build-tools.md` in the same pull requests, add manual test rows after BT36, and add in-game scenarios for the engine facts below.
- English only for everything committed.

## Evidence from the spike (2026-11-10, dev BDS, `@minecraft/server` 2.11.0, throwaway code discarded)

- `world.structureManager.place(id, dim, location, { rotation })` with `StructureRotation.Rotate90 | Rotate180 | Rotate270` rotated a 5 x 4 x 7 furnished building correctly. Preserved: chest items (slots 0 and 13), barrel items, standing and wall sign text, spawner, bed (both halves), stairs, furnace, log axis.
- Observed orientation changes under Rotate90 (clockwise seen from above): chest and furnace north to east, wall sign facing east to south, standing sign `ground_sign_direction` 4 to 8, log axis x to z, stairs `weirdo_direction` 2 to 1.
- Cell mapping under Rotate90 for a box of size (sx, sz): source (x, z) lands at (sz - 1 - z, x), measured from the placement location. The rotated structure's minimum corner is the placement location, so the new footprint is sz x sx anchored at the same corner (it is not rotated about the center).
- Size limit: 64 x 64 x 64 and 1 x 65 x 1 succeed; any axis X or Z above 64 throws `Structure size exceeds the maximum of 64x384x64.`. Capturing 64 x 64 x 64 took 24 ms.
- Not verified: doors (the spike's door command was invalid), entities, placement time for large boxes, and whether placing over existing blocks writes the structure's air (the paste rule in the spec says paste replaces the whole target box including air, so Phase 2 must assume it does).

## Decisions made with the owner

1. Axis: horizontal only, 90 degrees per step.
2. Phase 1 before Phase 2, because it satisfies the stated use (copy, place, turn) with the smallest change and adds the shared rotation parameter to the store.
3. Phase 2 is a menu entry shown after the two points are set (the shape menu, alongside Cut and Copy).
4. Phase 2 rotates about the center of the selected box.
5. Fidelity of the interior beats consistency with the old cell-based tools.

## Phase 1: rotate while aiming a paste

- The paste aim holds a quarter-turn count (0 to 3, clockwise seen from above). The Paste menu gains a "Rotate" entry.
- Choosing Rotate (owner decision) opens a rotate menu that keeps coming back until the player finishes. It shows the current heading (0, 90, 180 or 270 degrees) and has two buttons: "Rotate" (one more clockwise quarter turn, then the menu opens again) and "Done". Closing the menu with Escape counts as Done and keeps the turn. After Done the player is back in paste aiming with the turn applied.
- The outline and the target box use the rotated footprint: odd turns swap the X and Z sizes. The anchor stays the minimum corner outside the aimed face, as today: `pasteTarget` simply takes the rotated size, and the engine anchors the rotated structure at that minimum corner (spike evidence above).
- `BuildStructureStore.place` gains a rotation argument, passed to `StructurePlaceOptions.rotation`. Snapshot capture, `mayEdit` and the undo snapshot use the rotated target box.
- The turn persists across continuous pastes until New copy or End pasting (my call).
- The Paste menu opens only when the aim has no block hit, so the player looks at the sky to open it. A faster input (sneak plus use rotating one quarter turn while aiming at a block, with a live outline) is a possible follow-up once it is checked on touch devices. It is not part of this work.

## Phase 2: rotate the selected box in place

- A "Rotate" entry in the shape menu on a confirmed box, sharing the Cut and Copy height step on a horizontal rectangle.
- Steps: validate size and `mayEdit` on the union of the old and new boxes; capture the old box as the undo snapshot (covering the union box); capture the old box as the source; clear entities and blocks of the old box; place the source rotated 90 degrees at the new minimum corner; record the snapshot. On any failure restore the snapshot, as Cut does.
- New box: size (sz, sy, sx). Center rule (my call): `newMin.x = oldMin.x + trunc((sx - sz) / 2)` and `newMin.z = oldMin.z + trunc((sz - sx) / 2)`, rounding the half-cell offset toward zero; Y is unchanged. Document the rounding in the spec.
- Overwrite (owner decision): cells of the new box outside the old box are replaced by the rotated building, including terrain, water and neighboring blocks. Refuse, with a message and no change, only when a cell of the union box fails `mayEdit` (vehicle or camp space, laid blocks, unreadable cells). The undo snapshot covers the whole union box, so Undo restores the overwritten neighbors.
- After a successful rotation the new box is the confirmed selection and the flow stays in the same state, so the owner can press Rotate again for 180 and 270 degrees.
- A pasted region is not selected today and this work does not change that (my call). To rotate a building after it was pasted, select it with two points like any other region. Phase 1 covers "paste already turned". Making paste leave a selection is a possible follow-up because it touches continuous paste, New copy and End pasting.
- Limits (my call): the union of the old and new boxes is a max(sx, sz) by max(sx, sz) footprint when rotating about the center. Refuse with the too-large message when max(sx, sz) exceeds 64 or when that footprint times the height exceeds `BUILD_SPEC.maxCopyVolume`. No multi-piece snapshots.
- Exact return (owner decision): a turn swaps the sizes, so the offsets of two consecutive turns are exact negatives of each other. Two turns, and therefore four, return the box exactly; drift is 0. A property test asserts that applying the rotation twice returns the original box.
- Order of operations is the same whether or not placement writes air: capture the snapshot, clear the old box, then place. The air-write probe only records the engine fact and sets the refusal rule's wording; run it first as a short spike.
- Entities (my call): item frames, paintings and mobs are whatever the structure keeps today (ADR 0243, 0244). If the rotation probe shows they are lost or mis-turned, record it as a documented limitation; escalate to the owner only if blocks are affected.
- Undo uses the single snapshot slot, so a rotation replaces an earlier paste or cut undo, exactly like those do today. Say so in the spec.

## Left to the builder

- Exact message strings, menu icon and lang keys.
- Whether the Phase 2 height step can be skipped by rotating the full selected height.
- How to split work into pull requests, with the store parameter in its own commit or pull request.
- Test design: property tests for the box and center arithmetic, in-game scenarios for the engine facts (rotated chest items, sign text, door and bed states, entities).

## Open risks to verify early

- Door rotation, item frames and paintings under rotation, and large-box placement time.
- Whether placing at a rotated, partly overlapping location overwrites neighbors as predicted.
