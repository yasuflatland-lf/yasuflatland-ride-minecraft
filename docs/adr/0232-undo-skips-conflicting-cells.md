# 0232. Undo skips conflicting cells

- Status: Accepted
- Decided in: #1383
- Date: 2026-11-06
- Supersedes in part: [0178](0178-bulldozer-build-tools-in-a-separate-namespace.md): unconditional restoration of recorded before states in build undo behavior
- Supersedes in part: [0203](0203-build-wand-paste-aiming.md): unconditional restoration when Undo reverts the last paste

## Context

Undo previously planned each recorded before state without checking whether another builder had changed the cell after the original edit. Protection checks prevented some writes, but ordinary later edits could be overwritten. Issue #1383 records the owner's decision to skip conflicting cells rather than refuse the whole Undo. History is already consumed when Undo starts; keeping no retry record for unrestored cells remains the accepted limitation R24.

## Decision

1. Add an optional domain `expected` block state to `PlannedChange`. Undo plans require each recorded `after` state before restoring its `before`, in reverse order and in the recorded dimension. Plans without `expected`, including paste and shape plans, retain unconditional behavior.
2. `EditJobs` reads the current world state and compares it with `expected` before checking for an unchanged destination. A matching state permits the normal protection and write path. If the current state already equals the destination (the recorded `before`), do not write or count it as skipped. A state differing from both is a conflict: leave it unchanged and increment the skipped count.
3. For Undo, unreadable or unloaded cells, kept types, protection refusals, and failed writes also increment that same skipped count. Continue with the other cells; never refuse the whole Undo because of a conflict.
4. Show the existing `undoDone` completion message when no cells were skipped. Otherwise show `undoDonePartial` with the successfully restored count and the skipped count. Extend the feedback port with an optional skipped count while retaining existing count and material arguments, and translate both counts in every locale.
5. Consume the history record even when no cells can be restored. Keep no retry or redo record. Undo still retains the clipboard and paste aiming and clears the same-anchor repeat window.

## Consequences

Undo preserves later differing edits, and partial completion makes unrestored cells visible to the builder. Equality includes the block type and every permutation state; a later edit that ends at the original `after` is indistinguishable from an untouched cell and may be restored. Unreadable cells cannot be recognized as already reverted and count as skipped. Skipped cells cannot be retried from history. The pure domain plan carries the expected state, while world reads and protection decisions stay in the application job. Locale changes require a Resource Pack version bump. Revisit the consumed-history limitation if retry or redo is requested.
