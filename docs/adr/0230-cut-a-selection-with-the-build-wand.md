# 0230. Cut a selection with the Build Wand

- Status: Proposed
- Acceptance condition: issue #1358 is implemented and reviewed
- Date: 2026-11-05
- Supersedes in part: [0202](0202-build-wand-copy-and-continuous-paste.md): Decision 11 excludes Cut
- Extends: [0178](0178-bulldozer-build-tools-in-a-separate-namespace.md): protected edit jobs and in-memory undo history
- Extends: [0198](0198-one-build-wand-without-a-bulldozer.md): shape menu and inventory-free edits

## Context

Undo restores an earlier wand edit, but cannot empty an arbitrary selected range containing hand-placed blocks. Players need a deletion operation that uses the existing selection, protected edit jobs, and undo history. WorldEdit-BE's `cut` copies the region and then sets it to air, which also lets the player move a build; the owner asked for the same two steps.

## Decision

1. Offer Cut on every root shape menu, ordered as Adjust height (except for a line), Cut, Remove above, Build shape (Place for a line), Copy, Fill below, Cancel. Build shape opens the applicable styles and shape extras, followed by Back to the unchanged root selection. Opening or closing the build submenu redraws the preview using the current server tick. Cut is absent from the build submenu and utility menu.
2. Choosing Cut acts immediately on the entire selected box, including a one-layer horizontal rectangle. The clipboard records the player's cardinal facing at choice time.
3. Cut works in two steps. It captures the inclusive box as a structure clipboard and takes a separate undo snapshot before clearing blocks and eligible entities (0243). Fluids outside the box may flow back afterward.
4. A successful Cut replaces the clipboard and enters paste aiming, ending the active selection (0253). The clipboard contains the source as it was before clearing and can be pasted elsewhere at once.
5. Bound Cut by `BUILD_SPEC.maxCopyVolume` (32,768 cells), the same limit as Copy, because the whole box is stored. The bounding volume counts already-air and protected cells. Oversized or busy requests retain the selection flow, the old clipboard, and the prior confirmed box.
6. Check volume, then whether the session is busy, then protection across the entire box before capture. Refuse a protected box as a whole. A successful Cut records the snapshot for Undo (0243).
7. Undo restores the cleared area from the snapshot. The clipboard keeps its cut contents. See 0243 for capture refusals and rollback.

## Consequences

Players can empty a range containing terrain and hand-placed blocks and move it by pasting. A Cut overwrites the clipboard and cannot be undone back to the old one. An external fluid can refill the range afterward. Device menu behavior still needs live verification.
