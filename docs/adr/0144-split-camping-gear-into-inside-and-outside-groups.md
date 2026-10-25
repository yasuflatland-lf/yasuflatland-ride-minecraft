# 0144. Split camping gear into inside and outside groups

- Status: Proposed
- Date: 2026-10-25
- Extends: [0093](0093-decorate-the-parked-camper.md), [0122](0122-a-low-chair-to-sit-on-outside-the-vehicles.md)

## Context

The owner wants Creative players to distinguish gear used inside a vehicle from
outdoor gear that anyone can use without owning a vehicle. The single Camping
Gear group mixes the gift box and 19 camper decor items with the Low Chair and
Tent (0130). A table and fire pit will come later; this change adds no items.
The catalog generator introduced by 0138 owns the group order.

## Decision

Split the Items tab's camping gear into these two groups, followed by the existing
`yasu_ride:bulldozer_switches` group:

| Group id | English name | Icon | Items in order |
|---|---|---|---|
| `yasu_ride:camping_gear_inside` | Camping Gear (Inside) | `yasu_ride:camping_gear_box` | The box, then the 19 gear ids in `tools/camping_gear.json` order, each prefixed with `yasu_ride:` |
| `yasu_ride:camping_gear_outside` | Camping Gear (Outside) | `yasu_ride:low_chair_item` | `yasu_ride:low_chair_item`, then `yasu_ride:tent_item` |

The Japanese names are encoded here as Unicode escapes to keep documentation in
English; `ja_JP.lang` contains the actual translated characters:

- Inside: `\u30ad\u30e3\u30f3\u30d4\u30f3\u30b0\u7528\u54c1\uff08\u8eca\u5185\u7528\uff09`.
- Outside: `\u30ad\u30e3\u30f3\u30d4\u30f3\u30b0\u7528\u54c1\uff08\u8eca\u5916\u7528\uff09`.

Inside items remain vehicle-linked carriers, usable only on a parked camper's
furniture slots (0097). They cannot be crafted and normally come from the first
camper's box; Creative players can take them individually. The box still unpacks
the same 19 items with the unchanged "Camping gear" lore line.

Outside items are plain items owned by the camp feature, usable by anyone on
the ground without any vehicle. They place their own entities, never decor, and
never enter the box. Their Survival recipes and the refusal to place within a
vehicle's space (0122, 0129) stay unchanged.

Keep `OUTSIDE_IDS` separate from `GEAR_IDS` in the catalog generator and reject
overlap as well as duplicate groups or items, empty groups, and icons absent
from their group. Later outdoor items append to the outside list. Remove the old
`yasu_ride:camping_gear` group id with no alias. Item definitions, ids, assets,
recipes, and runtime behavior do not change.

## Consequences

Existing worlds are unaffected because the creative catalog stores no state.
The old group id disappears from both lang files, while
`yasu_ride.lore.camping_gear` stays unchanged. The Resource Pack header and module
and its Behavior Pack dependency move together from 0.1.124 to 0.1.125 (0015).
A server restart is needed to display the new groups and names.

Pack tests pin the exact groups, translations, order, and separation from decor.
Manual rows C32, C45, C159, C160, and the Bulldozer section's B11 cover the client
inventory and unchanged placement behavior; Creative groups are not observable
through the Script API. Revisit the grouping if future gear has a different
placement contract.
