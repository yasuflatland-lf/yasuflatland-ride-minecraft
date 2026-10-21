# 0096. Keep a parked vehicle's dock blocks whole

- Status: Accepted
- Date: 2026-10-21
- Extends: 0063, 0068, 0093

## Context

A held vehicle lays dock blocks: the boat's `deck_floor` (0063), and a parked camper's room, door step, bed, and decor (0068, 0092, 0093). `DockBlocks` records the cells it laid and saves them on the entity. Every tick it compares that record with the cells the drive wants. It never reads the world for a cell it already laid.

The v0.12.0 play test (#393) found two gaps:

- `minecraft:destructible_by_mining: false` stops survival mining only. A Creative player breaks any block at once, so a long-press or click in Creative left holes in the camper floor and removed a decor block.
- A laid block that the world loses stays lost. A player break, `/fill`, or `/setblock` left the cell as air, but the record still said it was laid, so it was not laid again until the camper departed and parked again.

`world.beforeEvents.playerBreakBlock` is stable and can be cancelled. Reading one block costs one `getBlock` call. A parked camper lays about 105 cells, plus up to 12 decor cells.

## Decision

- A player's break of a block is cancelled when a vehicle's `DockBlocks` laid the cell and the block's live type is the block it laid there. A block that a player put into a cell after the vehicle lost it belongs to that player, so it can still be broken. The check goes through the existing cell-owner lookup and has no list of block types of its own
- With an empty hand, a press on a decor block still removes it (0093). Breaking it is cancelled like any other dock block
- While the drive wants cells, `DockBlocks` reads every cell it laid for that vehicle once every 20 lays, which is once a second. It also reads them on the first lay after a reload. If the world holds air or a headlight light block in a laid cell, the cell is laid again in that same lay. If the world holds any other block there, the cell is left alone, as when a laid cell is cleared (0063). A cell whose chunk is not loaded (`getBlock` returns undefined or throws) is skipped until a later check
- `refloor` takes a predicate that marks a laid cell as lost. A wanted cell that the record holds with the same block is placed again only when the predicate says it is lost. Without the predicate, `refloor` works as before

## Consequences

- No player, in any game mode, can break a parked camper's room or decor, or a docked boat's deck. Commands can still remove them, and a parked vehicle puts them back within a second
- A parked camper reads about 105 to 117 blocks once a second, not every tick
- A laid cell that ends up holding water or a block placed by a player stays that way until departure, as before
- Check in Creative on PC and on a phone that a cancelled break leaves the block in place. If the client hides the block until the chunk is resent, revisit this decision
