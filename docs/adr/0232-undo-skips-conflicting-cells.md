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
2. `EditJobs` reads the current world state and passes it to the build domain's `decideWrite`. The domain compares it with `expected` before checking for an unchanged destination. The expected-state comparison ignores `minecraft:corner` because Bedrock recomputes stair corners from adjacent blocks. A matching state permits the normal protection and write path. If the current state exactly equals the destination (the recorded `before`), leave it alone and exclude it from the skipped count. A state differing from both is a conflict: leave it unchanged and increment the skipped count.
3. The domain tally counts conflicts as skipped. For Undo, unreadable or unloaded cells, kept types, protection refusals, and failed writes also increment that count. Continue with the other cells even when a conflict occurs.
4. Show the existing `undoDone` completion message when no cells were skipped. Otherwise show `undoDonePartial` with the successfully restored count and the skipped count. Extend the feedback port with an optional skipped count while retaining existing count and material arguments, and translate both counts in every locale.
5. Consume the history record even when no cells can be restored. Keep no retry or redo record. Cell Undo retains the clipboard and follows the existing selection restoration rule.

## Consequences

Undo preserves later differing edits, and partial completion makes unrestored cells visible to the builder. A later edit that matches the original `after` under the expected-state comparison may be restored. Unreadable cells cannot be recognized as already reverted and count as skipped. Skipped cells cannot be retried from history. The domain owns the plan, write decision and tally. `EditJobs` reads and writes the world and queries world protection when `decideWrite` needs it. Locale changes require a Resource Pack version bump. Revisit the consumed-history limitation if retry or redo is requested.
