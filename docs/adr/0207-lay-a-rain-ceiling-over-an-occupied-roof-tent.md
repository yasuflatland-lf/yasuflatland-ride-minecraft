# 0207. Lay a rain ceiling over an occupied roof tent

- Status: Proposed
- Acceptance condition: owner confirms in game
- Date: 2026-11-03
- Supersedes in part: [0200](0200-roof-tent-as-a-host-bound-camp-entity.md): only the clause "Roof tents lay no room blocks and claim no camp-space cells", for a temporary rain ceiling while occupied
- Extends: [0131](0131-pitch-a-tent-in-the-camp.md): reuse the invisible tent ceiling for roof tent rain shelter

## Context

Rain falls inside the roof tent. Bedrock draws rain per block column from the
blocks above; entities cannot occlude it. The ground camp tent already stops rain
with invisible `yasu_ride:tent_ceiling` blocks (0131). The owner chose to reuse
that block while a roof tent is occupied, removing it on every exit path.

## Decision

- While occupied, lay a ceiling over every column overlapping the yaw-rotated
  shell footprint, at the first integer cell above the ridge. The ladder property
  selects the SUV shell (approximately 3.9 by 2.4 blocks, ridge 1.625 above the
  origin); otherwise use the ground/camper shell (2 by 2.5 blocks, ridge 19/16).
  `roofTentCeilingCells` owns this pure geometry rule.
- Reuse `yasu_ride:tent_ceiling`. No new pack asset or manifest version is needed.
  Lay only on air and outside vehicle space; skip missing or unloaded blocks and
  never overwrite terrain. Keep previously recorded ceiling cells when laying
  again. An unrecorded ceiling block is not adopted from another shelter.
- Record exactly the successfully laid cells as JSON in the tent's dynamic
  property `yasu_ride:roof_tent_ceiling`, merging earlier recorded cells. Keep
  them in the occupant adapter snapshot too, so removal can clear them after the
  entity has gone. Parse saved cells defensively. Handle failures per cell and
  log at most one warning per lay or clear operation.
- `setOccupant` synchronizes the ceiling after updating occupancy. Leaving,
  folding, host removal or host use, death, logout, dimension change, and expired
  offline grace all reach occupant clearing or removal. Both `removed` and
  `forget` clear snapshot cells. Clear only cells still holding
  `yasu_ride:tent_ceiling`, preserving any replacement block, then forget the
  cell property.
- Every 20 ticks, the restore scan synchronizes every loaded tent: occupied tents
  re-lay missing ceiling cells idempotently and unoccupied tents clear stray
  recorded ceilings after script reload or restart. An empty unoccupied tent
  performs no block reads.
- The temporary ceiling claims no camp-space cells. The roof tent still lays no
  room blocks. Register its recorded cells with the shared laid-block Creative
  break guard, separately from the ground tent's guard.

## Consequences

An occupied roof tent can stop rain without changing its model or using unstable
APIs. The ceiling is world-aligned and can extend beyond the shell by part of a
block. Skipped terrain or vehicle-space cells can leave gaps in shelter coverage.
The reused block emits light at level 4 and has a 3 px collision box; these effects
are accepted while occupied.

The record is tied to the entity and an in-memory snapshot rather than a world
registry. If the entity is lost with its chunk unloaded, its record can be lost
and blocks may remain. An unload cleanup can skip inaccessible cells and clear
its snapshot while the entity retains a saved record; blocks may remain until
reload and a later restore scan. Permanently losing the entity record requires
manual cleanup. Revisit a persistent registry if that limitation becomes common.

Property tests cover geometry; adapter tests cover placement, recorded ownership,
replacement preservation, reload recovery, and cleanup after entity loss. Cleanup
handler tests cover the restore scan. These tests were added but not run for this
change. In-game behavior remains unverified until the owner confirms that rain
stops and no ceiling blocks remain after exits, folding, or host removal.
