# 0210. Defer legacy tent folding in unloaded chunks

- Status: Proposed
- Acceptance condition: the folding property tests, adapter and loop tests, and tent_fold_legacy in-game scenario pass (#1237)
- Date: 2026-11-03
- Extends: [0208](0208-fold-tents-with-older-layouts-on-load.md): loaded-anchor guard, deferred retries, and shared cell-layer cleanup
- Related: [0125](0125-forget-a-vehicle-removed-from-a-loaded-chunk.md)

## Context

The first tent-loop tick can see registry entries whose chunks are unloaded.
Refunding an item there can throw and prevent both folding other tents and
running the laying and flap loop. Removing such an entry can also lose the
cleanup record before the tent entity loads. The legacy removal path bypasses
the cell layer used by normal take-down (#1237).

## Decision

Keep `FoldLegacyTents`, `legacyTents`, and the `LegacyTentWorld` port. The port's
`foldInto(entry)` returns `"folded" | "deferred"`. Use the same `chunkLoadedAt`
probe as tent lifecycle removal at the entry's pose anchor. An unknown dimension,
an undefined block, or a thrown block read defers folding without changing the
entry, occupants, blocks, or item. The use case catches failures per tent,
continues with the others, and returns the number still deferred.

After the guard, eject occupants and use the existing playerless refund path.
Share take-down cleanup with normal removal: call `blocks.lay(id, entity, [])`,
then sweep `LEGACY_CLEAR_BOX` for only `yasu_ride:tent_*` blocks before removing
the registry entry, flap state, and entity. Do not reconstruct an old layout.

The first loop tick still folds before laying. Keep the deferred count and retry
while it is positive, once every `TENT_SPEC.cellRecheckTicks` ticks and when a
tent arrives through `entityLoad` or an `entitySpawn` with cause `Loaded`.
Stop retries at zero. A fold exception cannot prevent initialization or stop
the laying and flap loop. Skip entries below `TENT_LAYOUT_VERSION` during laying
so that a deferred tent never overwrites its saved cells with the current layout.

## Consequences

Unloaded tents retain their registry entries and saved cells until a retry can
fold them. The cell layer retains any unreadable saved cells for later cleanup.
The refund remains a drop at the tent because the registry stores no owner.

The in-game arena keeps the tent strip loaded through a lane ticking area and
cannot reliably unload one tent without disrupting the lane. Mocked tests cover
deferred retries; real unloading, chunk-boundary cleanup, and sleepers still
need live verification outside that arena.
