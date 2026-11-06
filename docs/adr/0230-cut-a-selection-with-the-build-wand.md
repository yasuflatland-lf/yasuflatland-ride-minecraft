# 0230. Cut a selection with the Build Wand

- Status: Proposed
- Acceptance condition: issue #1358 is implemented and reviewed
- Date: 2026-11-05
- Supersedes in part: [0202](0202-build-wand-copy-and-continuous-paste.md): Decision 11 excludes Cut
- Extends: [0178](0178-bulldozer-build-tools-in-a-separate-namespace.md): protected edit jobs and in-memory undo history
- Extends: [0198](0198-one-build-wand-without-a-bulldozer.md): shape menu and inventory-free edits

## Context

Undo restores an earlier wand edit, but cannot empty an arbitrary selected range containing hand-placed blocks. Players need a deletion operation that uses the existing selection, protected edit jobs, and undo history. The shared box-step flow already supplies upward height aiming, confirmation, and previews for Copy. WorldEdit-BE's `cut` copies the region and then sets it to air, which also lets the player move a build; the owner asked for the same two steps.

## Decision

1. Offer Cut on every shape menu, ordered as styles, shape extras, Cut, Copy, Cancel. Cut is absent from the utility menu.
2. On a horizontal rectangle, Cut uses the same upward height step as Copy, from one layer to `BUILD_SPEC.worldTopY`. Confirming starts the cut immediately. Every other shape cuts its selected box immediately. There is no contents menu or additional confirmation dialog: Undo restores changed cells.
3. Cut works in two steps. First it copies the inclusive box into the clipboard exactly as Copy does, reading synchronously before any write. Then it fills the box with `AIR` through `planShape` and `EditJobs`. Water and lava inside the box are removed; fluids outside may flow back afterward. There are no drops or inventory changes in any game mode.
4. A successful Cut replaces the clipboard, confirms the box, and enters paste aiming with Skip air off, exactly as Copy does, so the cut content can be pasted elsewhere at once. The clipboard holds the cells as they were before the cut, including cells that protection later keeps in place, and omits unreadable and kept-type cells as Copy does. Point 1 still rejects air, fluids, and kept types; its stored material is unused by Cut. Air endpoints remain supported.
5. Bound Cut by `BUILD_SPEC.maxCopyVolume` (32,768 cells), the same limit as Copy, because the whole box is stored. The bounding volume counts already-air and protected cells. Reuse the shared `boxStep` and `boxStepOver` preview layers and particles with this limit. Oversized or busy requests retain the selection flow, the old clipboard, and the prior confirmed box.
6. Keep the existing per-cell checks for kept types, protected space, unreadable or unchanged cells, and failed writes. Only successfully changed cells enter history, with exact before states for Undo. History remains per player and in memory.
7. Undo restores only the cleared cells. It does not restore the previous clipboard, because history holds block edits only. Reject an extra confirmation dialog: it adds a step that the existing Undo already covers. Reject a delete-only Cut that leaves the clipboard alone, the first design in this ADR: the owner chose the WorldEdit-style copy then clear. Redo, entity removal, undo of arbitrary hand placement, and history surviving reload remain out of scope.

## Consequences

Players can empty a range containing terrain and hand-placed blocks and move it by pasting. A Cut overwrites the clipboard and cannot be undone back to the old one. Protected cells can leave holes in the cleared range, a later paste can duplicate them, and fluid simulation can refill the range afterward. Entities in the range are not removed. Cut shares edit scheduling, history, height aiming, and previews rather than introducing a new planner. Locale changes require a Resource Pack version bump. Device forms, particles, fluid flow, and inventory behavior still need live verification. Revisit this decision if entity removal or persistent history is requested.
