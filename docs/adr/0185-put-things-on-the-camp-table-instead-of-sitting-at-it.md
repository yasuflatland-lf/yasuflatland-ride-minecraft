# 0185. Put things on the camp table instead of sitting at it

- Status: Proposed
- Date: 2026-10-29
- Extends: 0152 (the camp table), 0168 (the Dutch oven and its hosts), 0173 (the Gas Lantern, which now may stand on a table)
- Supersedes in part: 0152 (the two seats, the Sit interaction, and "does not accept placed items") and 0168 (rule 5: a missing host no longer drops the oven to the ground; rule 1: new ovens on a table no longer use two fixed spots; rule 8: an overlap and limit check replaces the occupied-spot refusal on a table; Out of scope: the table may now hold Gas Lanterns)

## Context

The owner wants the outside Camp Table to hold camp gear where the player aims, without seats. Today it seats two players (0152), holds Dutch ovens in two fixed spots (0168), and cannot hold the ground Gas Lantern (0173). The [design](../superpowers/specs/2026-10-29-camp-table-top-placement-design.md) replaces those spots with placement on the top and removes hosted gear when its host disappears.

`TABLE_SPEC`, `TABLE_TOP_PX`, `DUTCH_OVEN_SPEC`, and `GAS_LANTERN_SPEC` in `src/domain/camp/spec.ts` hold the existing tuning. Saved ovens must keep working through the change.

## Decision

1. **Seats.** The table has no seats (`minecraft:rideable` is removed) and no Sit interaction. The Low Chair and Noga Chair keep theirs.
2. **Aim and footprint.** A Dutch oven or Gas Lantern item used on the tabletop stands where the view ray meets the tabletop plane, expressed in table-local pixels and clamped so its whole footprint lies inside the top. Footprints are axis-aligned rectangles in table-local pixels, measured from the generated models; their tuning values stay next to `TABLE_TOP_PX` in `src/domain/camp/spec.ts`. Refuse a placement whose clamped footprint overlaps another item's; touching edges is allowed.
3. **Limit.** At most 4 items stand on a table, ovens and lanterns together. Count by scanning hosted entities whose host marker names the table; keep no stored list.
4. **Clearance.** Keep the check for free space above the item using `DUTCH_OVEN_SPEC.clearance` or `GAS_LANTERN_SPEC.clearance` from its definition.
5. **Consumption.** A refused placement consumes nothing. A successful placement consumes the item in Survival, but not Creative.
6. **Taking back.** Three quick hits on a placed oven or lantern drop its item and remove the entity, as on the ground. A lantern also clears its light block; switching and light otherwise behave as on the ground.
7. **Folding.** The table folds only when nothing stands on it. Both ovens and lanterns count; otherwise show the existing on-top hint.
8. **Missing hosts.** When a table or Fire Pit disappears, remove the oven or lantern standing on it with no drop, no entity, and no light block. Keep checking every `DUTCH_OVEN_SPEC.hostCheckTicks`. If either the host's chunk or the item's chunk is unloaded, never treat the host as missing. This replaces 0168 rule 5 and deletes its fall-to-ground code path and tests.
9. **Saved ovens.** The old `camp_table:<hostEntityId>:<spot>` marker still decodes (a Fire Pit oven keeps its `fire_pit:<hostEntityId>:<spot>` marker) and maps to the old spot position. Such an oven keeps working and counts toward the limit and overlap check like any other item, with no legacy branch in the placement rule.
10. **Lantern hosts.** A Gas Lantern gets an optional host marker. A lantern with no marker is a ground lantern and is never removed by the host check.
11. **Shared rule.** Clamp, overlap, and limit are pure domain logic with property-based tests. Each hosted item kind gets a definition (footprint, clearance, item, entity type), and one placement rule runs over them, without branching on oven versus lantern in shared logic. Entity calls stay in `src/infrastructure/camp`.
12. **Fire Pit.** Keep its single fixed oven spot and today's placement. Only the removal rule changes for it.

### Series

1. 1/8: this ADR and the design doc.
2. 2/8: remove the table's seats.
3. 3/8: domain tabletop placement rule.
4. 4/8: domain host marker codec.
5. 5/8: free placement of the Dutch oven on the table.
6. 6/8: Gas Lantern on the table.
7. 7/8: remove hosted ovens when the host disappears.
8. 8/8: remove hosted lanterns with the host, docs, and in-game tests.

### Out of scope

Vanilla blocks, flowers, or other items on the table; the table as a block; rotating or stacking placed items; dispensers.

## Consequences

The Fire Pit still takes one oven at one fixed spot. Flowers and other blocks cannot be placed on the table because it stays an entity. Losing a table now also loses what stands on it; this is an accepted downside.

In 2/8, check a saved world's table with a seated player in game when the rideable component goes. Add a dismount step only if a stale rider remains. Revisit nudging instead of refusing if overlap refusals feel strict on a phone.
