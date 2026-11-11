# 0240. Resort furniture family

- Status: Proposed
- Acceptance condition: review of issue #1462; later issues verify furniture assets and behavior in game
- Date: 2026-11-09
- Extends: [0050](0050-vehicle-kinds-and-per-kind-profiles.md): per-kind parameters for resort furniture
- Extends: [0237](0237-register-tabletop-hosts-across-features.md): dining table hosting
- Related: [0238](0238-lounge-pose-by-overriding-the-player-client-entity.md): lounge pose remains exclusive to the Beach Chair
- Related: [0239](0239-a-beach-chair-that-folds-into-a-table.md): existing Beach Chair remains unchanged

## Context

The Dining set design adds a Dining Table, Dining Chair, single sofa, and double sofa to Resort Gear. They need common placement and recovery rules, with different footprints, seats, and tabletop capabilities. The Beach Chair already has a separate three-cell footprint, folding behavior, and lounge pose that these pieces do not need.

## Decision

Keep furniture in the resort feature. Store all per-kind tuning in the deeply frozen `FURNITURE_SPEC` table, following 0050. Shared furniture logic reads the table without branching on kind. Each entry defines pressed-cell offsets, clearance, rideable seats, three hits to take back, a 100-tick hit reset window, and an optional `TopSurface`.

Place furniture one cell above the pressed block and face the player with `snapYaw4(playerYaw + 180)`. Use the footprint centre at floor height as the entity origin. The initial single-cell pieces need two clearance layers. The double sofa occupies the pressed column and the column to the player's right, with offsets `{ ahead: 0, left: 0 }` and `{ ahead: 0, left: -1 }`. Its origin lies on their shared boundary; seats are at model x = -0.5 and +0.5 blocks.

Sitting uses `minecraft:rideable` with the per-kind seat offsets and vanilla riding behavior. Do not apply the lounge pose override from 0238 to furniture.

The Dining Table has two complementary parts: a tabletop host registered through the shared registry from 0237 for Gas Lanterns and Dutch Ovens, and an invisible solid tabletop block for ordinary blocks. Later integration records, repairs, and clears laid blocks, prevents hosted items and ordinary blocks from sharing the top, and refuses recovery while anything stands on it. The initial tabletop surface has half extents 0.4 by 0.4 blocks, height 12 px, limit four, and clearance base zero.

Leave the Beach Chair and its placement, recovery, folding, hosting, and lounge pose code untouched. This issue adds only furniture domain values and geometry; pack assets and in-game integration follow separately.

## Consequences

Later furniture pieces share placement geometry and recovery parameters without inheriting Beach Chair behavior. Some pose math is intentionally separate because the Beach Chair has different geometry and posture requirements. Pack work must verify seat offsets against the table and may refine initial model dimensions. The table's dual representation requires lifecycle cleanup and interaction forwarding in later issues; domain tests alone do not verify those engine behaviors.
