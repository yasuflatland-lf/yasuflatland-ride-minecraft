# 0132. Open and close each tent flap alone

- Status: Proposed (to be Accepted once the flap checks under Tent in [manual-test.md](../manual-test.md) pass)
- Date: 2026-10-23
- Extends: [0131](0131-pitch-a-tent-in-the-camp.md) (the tent's cells and loop), [0105](0105-toggle-a-camper-door-once-per-swing.md) (one toggle per tap window), 0121 (restoring a door from its float property), 0127 (resending after a failed property write), 0101 (invisible blocks)

## Context

The tent has four openings: the front of the front room, the front room's left and
right sides, and the bedroom's door between the two rooms. After 0131 their cells
(`TENT_FLAPS`, two cells each, eight in all) were plain `tent_wall` plates, so none of
them could be opened. The entity already carries one synced float property per flap
(`yasu_ride:flap_*`, 0..1), and its animation rolls each flap bone up by that value.

The camper's entry door is the model: an invisible door cell whose `open` state follows
the door's target, a tap toggle that ignores the second event one tap sends (0105), and
a swing of one step per tick. Camp cannot import vehicle code (0046), so the pattern is
copied, not shared. Unlike the camper, which moves all its doors together, a tent's
openings are separate doors of one shelter.

## Decision

- One tap moves only the tapped flap. Each flap keeps its own target, swing step,
  `TapToggle`, and `SyncedValue`; a tap on one flap never changes another's.
- Each flap's tap window equals `TENT_SPEC.flapSwingTicks` (10 ticks), the same value
  the swing takes, so the window and the animation cannot drift apart (0105).
- The laid block follows the flap's target through `TentState.openFlaps`, not its swing:
  `tentCells(pose, state)` lays every `TENT_FLAPS` cell as
  `{ type: "flap", id, open }` and leaves every other cell and the cell order unchanged.
  An opening becomes passable on the lay after the tap.
- A flap cell is the new `yasu_ride:tent_flap` block with one state, `yasu_ride:open`.
  Closed, its collision and selection boxes fill the whole cell. This is chosen over the
  camper's 2 px plate because the tent must keep mobs out: a full cell is never a path.
  Open, it has no collision and keeps the full selection box, so a tap from either side
  still lands on it.
- A flap does not close while a player or a mob stands in one of its cells. The tapper
  sees "Someone is in the way of the flap", and the refused tap does not use up the
  window. Opening never checks for a blocker.
- The tent loop moves every loaded tent's flaps one step per tick, writes the changed
  values to the entity, and on a failed write resends every flap on the next tick (0127).
- After `/reload` or a restart, the first loop tick rebuilds the flaps from the float
  properties with 0121's rule: `step = clamp(round(v * steps), 0, steps)`, open when
  `step * 2 >= steps`. A flap reloaded mid-swing ends on the nearer side.
- A tent saved before this change has walls in its flap cells. A flap cell is not the
  same block as a wall, so the first lay replaces them through the relay diff, with no
  migration.
- In-game tests tap a flap with the `yasu_ride:test_tent_flap` script event
  (`"<tent id> <flap>"`), since a test cannot tap a block.

## Consequences

- A hit on a flap cell, open or closed, counts toward taking the tent down, as a hit on a
  wall does, since the owner lookup goes through the block id.
- A closed flap is a full block a player cannot stand in, so the flap cell is either a
  door or a passage, never a place to stand while closed.
- The blocker check asks for players and mobs whose feet are within 0.3 of a flap cell,
  so a body that leans into the opening from the next cell also keeps the flap open. A
  player standing right beside a flap cell can therefore keep it from closing.
- The reload rule does not check for blockers. A flap tapped open less than half a swing
  (under 5 ticks) before a restart comes back closed and can close on someone who has
  just stepped into the opening, who is then pushed out. The window is short enough to
  accept.
- The four flaps make four property writes on the first tick after a rebuild, then only
  while a flap swings.
- Revisit the full-cell closed box if mobs still walk in through a closed flap, or if a
  phone tap from inside misses it.
