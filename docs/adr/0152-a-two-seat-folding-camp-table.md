# 0152. A two-seat folding camp table

- Status: Proposed
- Date: 2026-10-26
- Extends: 0122 (outside camping gear), 0144 (inside and outside catalog groups)

## Context

The camp needs a table matching the supplied photographs: a long bamboo-colored wooden top and black folding X legs. The owner wants two people to sit beside each other without changing the photographed table's appearance. Low Chairs remain separate items. The table does not accept placed items or blocks on its top.

## Decision

- Add `yasu_ride:camp_table_item` to the Camping Gear (Outside) group and craft it from bamboo planks, a stick, and iron ingots. It places `yasu_ride:camp_table` on the top of a block outside vehicle space.
- The table uses a Script API entity so it can provide two `minecraft:rideable` seats, with the same Sit interaction as the Low Chair. Both seat positions have equal height and depth and differ only along the long axis. No seat or bench geometry is added to the table model.
- Its 30 px long tabletop accommodates two 12 px wide Low Chairs side by side with a gap. The seat centers are 14.4 px apart along that length.
- Snap its yaw to quarter turns. Center the entity at the boundary of two adjacent ground cells so two Low Chairs placed in front of those cells line up under the ends of the tabletop. Check both cells for two free blocks above, vehicle space, and add-on room blocks before placement. Refuse a second nearby table.
- Three quick hits recover the item while neither seat is occupied. Hits while occupied do not advance the counter. Its model and wood-grain texture are generated and previewed with `pnpm model`.
- Keep the table in `camp`; no `vehicle` feature imports are needed. Resource Pack version 0.1.135 and the Behavior Pack dependency advance together.

## Consequences

Two players can choose the same table and sit side by side, while Low Chairs can also be placed separately. The seat positions may need visual tuning against the players and chairs on a PC and a touch client. The table's entity does not provide a block placement surface; this matches the requested behavior. Its collision box is square even though the tabletop is long, as with other Bedrock entities (0009).
