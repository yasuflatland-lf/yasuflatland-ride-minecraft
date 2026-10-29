# Camp Table top placement: design

Date: 2026-10-29. Status: draft for the owner's approval.

## Intent

The outside Camp Table (ADR 0152) is a two-seat table whose top takes only Dutch ovens, in two fixed spots (ADR 0168). The owner wants a table to put things on, not to sit at: take the seats away, and let the player put camp gear on the top where they click. The motive is to set a pot and a lantern on the table the way one does at a campsite.

## Goals

1. The table has no seats and no Sit interaction.
2. A Dutch oven or a Gas Lantern item, used on the tabletop, stands at the point the player aims at. The point is clamped so the whole item stays on the top.
3. A table holds at most 4 such items in total, ovens and lanterns together.
4. When a table disappears, every oven and lantern standing on it disappears with it, leaving no item and no entity. This is the same for a Fire Pit: when the pit disappears, the oven on its grill disappears.
5. A lantern on the table behaves as a lantern on the ground: switching, light, and taking it back by three quick hits.

## Non-goals

- Placing vanilla blocks, flowers, or any other item on the table. The table stays an entity; the owner dropped "anything" and "real flowers" for now.
- Making the table a block.
- Rotating placed items, stacking items, or placing on the table from a dispenser.
- Changing how a table or a fire pit is placed or folded, except as listed under Behavior.

## Anti-goals

- An item floating beyond the tabletop edge, or two items overlapping.
- Losing an oven that a world already holds on a table in the old fixed spots.
- Leaving a half-removed entity (an oven whose light block or host marker is still there).

## Behavior

1. **Seats.** Remove the rideable component from the table's entity definition. The Sit interaction text for the table goes with it. The Low Chair and Noga Chair keep theirs.
2. **Placing.**
   - Using a Dutch Oven or a Gas Lantern item on the table entity places it at the point where the player's view ray meets the tabletop plane (the existing `aimOnPlane` and `hostLocalPx` give this point in the table's local pixels).
   - The point is clamped so the item's footprint lies inside the tabletop rectangle. The footprint of each item is a tuning value kept with the table's other values (`TABLE_SPEC` or a sibling), measured from the item's model.
   - If the clamped footprint overlaps an item already on the table, the placement is refused and nothing is consumed. (Owner's call: nothing about nudging was asked for, so this design refuses.)
   - If the table already holds 4 items, the placement is refused.
   - The tabletop clearance check stays: the cell above the item needs the air its entity needs (`DUTCH_OVEN_SPEC.clearance`, `GAS_LANTERN_SPEC.clearance`).
   - Survival consumes the item; Creative does not, as today.
3. **Taking back.** Three quick hits on a placed oven or lantern drop its item and remove the entity, as on the ground. For an oven this is today's behavior; for a lantern on a table it is the same as on the ground, and its light block is cleared.
4. **Folding the table.** Three quick hits fold the table into its item only when nothing stands on it, as today for ovens; now lanterns count too. With something on it, the player sees the existing "something is on top" hint.
5. **When a host disappears.** If the entity a hosted oven or lantern stands on (a table or a fire pit) is gone, the oven or lantern is removed: no drop, no entity, no light block. This replaces 0168's "the oven closes its lid and falls to the ground". The check keeps running where it runs today (the host check every `DUTCH_OVEN_SPEC.hostCheckTicks`, skipped while the host's chunk or the item's chunk is unloaded, so an unloaded host is never mistaken for a missing one).
6. **Saved worlds.** An oven already standing on a table in one of the two old spots keeps standing there and keeps working. The saved host marker must still decode.
7. **Docs and tests.** Update the Camp Table and Dutch Oven entries of `docs/items/camping-gear.md` (no seats; what the top holds; the 4-item limit; removal with the host), the manual test rows for the table, and the in-game scenarios of the camp.

## Constraints

- Stable APIs only (ADR 0001). The layers and feature boundaries stay: the placement rule (footprint, clamp, overlap, limit) is pure domain logic with property-based tests; the entity calls stay in `src/infrastructure/camp`.
- Do not branch on "oven or lantern" inside shared logic (AGENTS.md, per-vehicle parameters, applied to camp gear): give each hosted item kind a definition (footprint, clearance, item, entity type) and run one placement rule over them. This means refactoring the table placement of the oven into that shared rule first, without behavior change, and then adding the lantern as the second definition.
- A new ADR records the changes: it supersedes in part 0152 (seats and "accepts no other placed items") and 0168 (a missing host no longer drops the oven). Do not rewrite those ADRs' Decisions; update their statuses and the ADR table.
- Behavior Pack changes need `/reload` or a restart; if the Resource Pack changes, bump its manifest version (0015). Removing the table's rideable component is a Behavior Pack change; check whether the model or lang files change too.

## Left to the builder

- The footprints and the tabletop rectangle in pixels, taken from the generated models (`tools/gen_camp_table.py`, the oven and lantern generators). Keep them next to `TABLE_TOP_PX`.
- The shape of the saved host marker for free positions, as long as the old `camp_table:<id>:<spot>` markers still decode and map to the old spot positions.
- How the lantern gets a host at all (it has none today), including whether it reuses the oven's host property and check or gets its own, and how the light-follow loop treats a lantern that does not fall.
- The wording of messages for a full or blocked top, and their lang keys.
- Issue and PR split. The owner's rules: one PR per issue, refactors first, parallel where possible, `N/M` in titles.

## Decisions the owner made

- No seats at all.
- Click position placement is preferred; two fixed spots are acceptable if free placement proves too hard.
- At most 4 items per table, ovens and lanterns together.
- A disappearing host removes what stands on it, with no drop; a Fire Pit follows the same rule.
- Only the Dutch oven and the Gas Lantern, for now.

## Calls made while writing this design

These settle questions a builder would otherwise have to guess. They are the author's calls, not the owner's.

- **Old ovens.** An oven standing in one of the two old fixed spots is an ordinary item at that position. It counts toward the limit of 4 and takes part in overlap checks. There is no legacy branch in the placement rule; only the saved marker still decodes (Behavior 6).
- **Hosted lanterns.** A Gas Lantern gets an optional host marker, as the oven has. A lantern with no marker is a ground lantern: the host check never touches it, and its take-back, switching, and light-follow behave as today. A lantern with a marker follows the oven's rules for removal with its host.
- **Counting what stands on a table.** Count by scanning for hosted entities whose marker names the table, as `takenTableSpots` does today. No separate stored list. Folding, the limit, the overlap check, and removal with the host all use that scan.
- **Fire Pit.** Its oven keeps the single fixed spot and today's placement. Only the removal rule changes for it (Goal 4).
- **0168's fall path.** Delete the code that turns a hosted oven into a ground oven when its host is missing, and its tests. An unloaded host is still not a missing host (Behavior 5).
- **Seated players.** Removing the rideable component should leave no rider behind. Check this in game with a player seated before the change; add a dismount step only if a stale rider remains.
- **Overlap.** Footprints are axis-aligned rectangles in the table's local pixels. Touching edges is allowed; overlapping area is refused.
