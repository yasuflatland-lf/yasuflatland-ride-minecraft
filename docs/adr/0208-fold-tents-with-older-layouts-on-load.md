# 0208. Fold tents with older layouts on load

- Status: Proposed
- Acceptance condition: the layout-version property tests and the tent_fold_legacy in-game scenario pass (#1225)
- Date: 2026-11-03
- Extends: [0131](0131-pitch-a-tent-in-the-camp.md): registry layout versions and load-time folding
- Related: [0012](0012-ddd-layered-architecture.md)
- Related: [0046](0046-organize-each-layer-by-feature.md)

## Context

A later tent shape change must not leave the previous shelter blocks in saved
worlds. The owner chose to fold pitched tents when their layout becomes old,
rather than retain previous cell layouts. The registry currently records no
owner, and ordinary take-down refuses occupied tents rather than moving players.

## Decision

Save a nonnegative integer `layout` on every `TentEntry`. Missing versions decode
as 1, the layout used before versioning. New tents use `TENT_LAYOUT_VERSION`,
which stays 1 in this change. Bump it when laid cells or the clear box change.
Entries with a version equal to or above the current version are preserved.

Run `FoldLegacyTents` on the first tent-loop tick, outside early execution and
before the loop reads its entries for laying. For each older entry, first eject
players whose floored feet are within the cleanup box, including sleepers, to
the center of local `(0, depth -1, layer 0)`, directly in front of the tarp.
Dismount riders before teleporting them. Ground tents have no existing exit to
reuse; the roof-tent exit depends on a separate host and saved entrance.

The domain retains only `LEGACY_CLEAR_BOX = { halfWidth: 3, depth: 12, layers: 4 }`,
layout 1's cleanup footprint, with x -3..3, depth 0..11, and layers 0..3. Transform
these cells with `tentCellAt`. Clear only block IDs starting with
`yasu_ride:tent_`, preserving every other block. Do not reconstruct old geometry
or use the current layout to select cleanup cells.

Call the same `returnTentItem` method as `TakeDownTent`, with no player. It drops
one plain tent item at the entity location, falling back to the registered pose
when the entity is unavailable. Refund before removing the registry entry and
entity, because that method needs their location. Share registry, flap-state,
and entity removal with normal take-down. Removing the entry makes a second
successful execution do nothing for that tent.

The server-only `test_tent_fold_legacy` hook replaces an existing entry with
layout 0 and invokes that same folding instance, standing in for a reload that
an in-game test cannot perform. It creates no missing entries.

## Consequences

At version 1, existing unversioned tents remain pitched. A later version bump
can fold the older tents without retaining their cell layout. Domain and
application rules remain independent of the Bedrock API.

The item cannot be delivered to an owner because none is stored. The shared
playerless refund path drops it at the tent instead. The ground exit does not
search for safe footing if someone has changed terrain in front of the tarp;
revisit that policy if live checks show it needs an alternate exit. Chunk-boundary
cleanup and sleeping-player teleport behavior still need live-server checks.
