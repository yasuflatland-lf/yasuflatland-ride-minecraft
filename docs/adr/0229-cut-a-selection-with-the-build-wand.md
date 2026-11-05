# 0229. Cut a selection with the Build Wand

- Status: Proposed
- Acceptance condition: issue #1358 is implemented and reviewed
- Date: 2026-11-05
- Supersedes in part: [0202](0202-build-wand-copy-and-continuous-paste.md): Decision 11 excludes Cut
- Extends: [0178](0178-bulldozer-build-tools-in-a-separate-namespace.md): protected edit jobs and in-memory undo history
- Extends: [0198](0198-one-build-wand-without-a-bulldozer.md): shape menu and inventory-free edits

## Context

Undo restores an earlier wand edit, but cannot empty an arbitrary selected range containing hand-placed blocks. Players need a deletion operation that uses the existing selection, protected edit jobs, and undo history. The shared box-step flow already supplies upward height aiming, confirmation, and previews for Copy.

## Decision

1. Offer Cut on every shape menu, ordered as styles, shape extras, Cut, Copy, Cancel. Cut is absent from the utility menu.
2. On a horizontal rectangle, Cut uses the same upward height step as Copy, from one layer to `BUILD_SPEC.worldTopY`. Confirming starts the cut immediately. Every other shape cuts its selected box immediately. There is no contents menu or additional confirmation dialog: Undo restores changed cells.
3. Cut fills the entire inclusive box with `AIR` through `planShape` and `EditJobs`. Water and lava inside the box are removed; fluids outside may flow back afterward. There are no drops or inventory changes in any game mode.
4. Cut only deletes. It leaves the clipboard unchanged and never starts paste aiming. A successful Cut confirms the box and returns the selection flow to idle, like other edits. Point 1 still rejects air, fluids, and kept types; its stored material is unused by Cut. Air endpoints remain supported.
5. Bound Cut by `BUILD_SPEC.maxVolume` (100,000 cells), including already-air and protected cells in the bounding volume. Reuse the shared `boxStep` and `boxStepOver` preview layers and particles with this limit rather than Copy's smaller limit. Oversized or busy requests retain the selection flow, clipboard, and prior confirmed box.
6. Keep the existing per-cell checks for kept types, protected space, unreadable or unchanged cells, and failed writes. Only successfully changed cells enter history, with exact before states for Undo. History remains per player and in memory.
7. Reject a cut-and-paste move: it would replace the clipboard and introduce move semantics outside this deletion operation. Reject an extra confirmation dialog: it adds a step that the existing Undo already covers. Redo, undo of arbitrary hand placement, and history surviving reload remain out of scope.

## Consequences

Players can empty a range containing terrain and hand-placed blocks without touching their clipboard. Protected cells can leave holes in the cleared range, and fluid simulation can refill it afterward. Cut shares edit scheduling, history, height aiming, and previews rather than introducing a new planner. Locale changes require a Resource Pack version bump. Device forms, particles, fluid flow, and inventory behavior still need live verification. Revisit this decision if a separate move operation or persistent history is requested.
