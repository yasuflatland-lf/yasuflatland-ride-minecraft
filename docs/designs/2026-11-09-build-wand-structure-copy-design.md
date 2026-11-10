# Build Wand: copy everything in the box with the engine structure API

## Intent

Copy and Cut on the Build Wand record only each cell's block type and states (`clipboardOf`, `BlockState`). A building copied this way loses what its blocks hold and everything that is not a block:

- Chests, barrels, furnaces, and other containers (and shulker boxes) are skipped entirely, so their cells stay as they were at the paste target.
- Signs, spawners, and command blocks are skipped for the same reason.
- Item frames, paintings, armor stands, animals, and vehicles are never read.

The owner builds decorated structures by hand and wants a copy that looks and works like the original: contents kept, decorations present. The reference implementation, WorldEdit-BE (`src/server/modules/region_buffer.ts`), saves the region with `world.structureManager.createFromWorld`, which keeps block data and, optionally, entities.

`StructureManager` is in the stable `@minecraft/server` 2.11.0 type definitions (no `@beta` tags in the file), so ADR 0001 does not block it. Real engine behavior is not verified yet (see Open questions).

## Goals

1. Copy saves every block with its data and every non-player entity in the selected box, as one engine structure.
2. Paste places that structure, and first removes the non-player entities already inside the paste box, so the result matches the original.
3. Cut copies the same way, then empties the source box: blocks become air and non-player entities in the box are removed.
4. Undo restores the last paste or cut, including container contents and removed entities.

## Non-goals

- Rotation, flip, scale, and stack of the clipboard (still out of scope as in ADR 0202).
- Saving structures to disk or sharing them between players or worlds.
- Copying players.
- More than one undo step (see Decisions).

## Anti-goals

- A copy that silently drops contents, as today, or one that looks successful but pastes empty containers.
- Pasting that leaves two copies of an entity at the target (the old one plus the pasted one).
- Using beta Script APIs, experimental toggles, or `@minecraft/server-gametest` (ADR 0001).

## Decisions made with the owner

1. Copy includes all entities in the box: decorations, animals, and vehicles (not players).
2. Undo of paste and cut keeps one step only: a player's undo history holds at most one structure snapshot entry. The history is shared with fill, shape, and terrain edits, which keep the existing cell-record entries and the 10-entry depth (my call, to leave those edits unchanged). A new paste or cut drops the older snapshot entry and deletes its structure.
3. Paste may overwrite containers and other kept blocks at the target, contents included. The `PLACE_KEPT_BLOCKS` protection no longer applies to paste.
4. Before pasting, non-player entities already inside the paste box are removed and replaced by the pasted ones.
5. Cut copies all blocks and entities, then turns the source box into air and removes its non-player entities. Kept blocks are no longer left behind.

6. This addon's vehicles (SUV, camper, sports boat, bulldozer) are not copied, so the fleet limits of ADR 0038 and 0066 cannot be bypassed. Other entities (animals, decorations, other vehicles) are copied. The copy skips these vehicles by their entity type IDs; the removal step of Decision 4 and Cut still must not delete them, so a vehicle standing in a paste or cut box stays where it is.
7. The paste mode that skips air (`flow.skipAir`) is removed. A paste always writes every cell, air included.

## Design direction

These parts are my proposal, not yet agreed:

- The clipboard holds an engine `Structure` (saved in `Memory` mode) plus its size. The preview outline and paste aiming only need the size, so they keep working.
- Undo snapshot: before each paste or cut, save the affected box (blocks and entities) as a second in-memory structure. Undo removes the non-player entities in that box, then places the snapshot back. Each player owns at most one clipboard structure and one undo structure; a new one deletes the old one so structures do not accumulate.
- Structure names need a namespace and must be unique; use a per-player name under the `yasu_build:` namespace (ADR 0178 keeps build IDs there).
- Paste-time protection that is not about kept blocks stays: `mayEdit` still refuses a paste whose box touches a vehicle space, a camp space, or a block tagged `yasu_ride:laid`.
- Layering (ADR 0012, 0046): the structure calls live in infrastructure behind a new port in `src/application/build/ports/`. The domain keeps the clipboard as an opaque handle plus size and the pure geometry it already has. `clipboardOf` and the kept-block rule for copy are removed or reduced.

## Constraints

- Stable Script API only; `world.structureManager` runs in normal (not restricted) execution.
- Copy limit stays `BUILD_SPEC.maxCopyVolume` (32,768) unless the structure test shows a different engine maximum. WorldEdit-BE splits at 64 x 256 x 64, which suggests an engine size limit.
- `createFromWorld` throws on an oversized box or one outside world bounds; both must show the existing "too large" style message and leave state unchanged.
- The edit-job pipeline in `src/application/build/` writes cells over several ticks. A structure place is one call, so paste and cut no longer use it; its progress and "undoable" journal for these two actions go away.
- Spec, ADR, and tests: a new ADR supersedes the relevant part of 0202 Decision 11 ("block entity contents in the clipboard" is not included), 0230 (Cut), and 0232 (undo skips conflicting cells) for these actions. `docs/specs/build-tools.md` is updated in the same pull request. `pnpm lint:docs` and `pnpm run docs` apply.
- All committed text is English (`pnpm lint:lang`).

## Left to the builder

- Exact structure naming, cleanup of stale structures after a server restart (structures in `Memory` mode do not survive it), and the module split.
- The test plan: unit tests for the pure parts, plus in-game scenarios for container contents, signs, item frames, animals, undo, and cut. Add `CATALOG` entries as `AGENTS.md` requires.

## Open questions

Marked with who must decide.

1. Builder: the engine structure saves every entity, with no filter. Skipping this addon's vehicles (Decision 6) needs a way to leave them out, for example by moving them aside, saving, and restoring, or by deleting the copied vehicle entities from the pasted result. The builder picks the approach after the engine facts below are known, and must keep the vehicles' fleet state intact.
2. Engine fact, to verify with a throwaway scenario before the plan: the maximum structure size, whether `place` restores container contents and sign text, whether entities in `Memory` structures survive, and whether `place` removes or duplicates existing entities (so the pre-removal step is needed or not).
3. Builder, minor: does an entity's tag or dynamic property (for example a paint color) survive the structure round trip?
