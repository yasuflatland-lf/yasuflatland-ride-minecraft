# 0023. Give each player a vehicle item on their first join

- Status: Accepted
- Date: 2026-10-11

## Context

Before starter vehicles, Survival players had to craft the vehicle item (0008). The SUV recipe (`packs/yasu_ride_bp/recipes/yasu_ride/suv_item.recipe.json`) takes 5 iron ingots, 1 iron block, and 2 coal blocks: 14 iron ingots and 18 coal in all. That takes long enough that a new player on the home LAN server cannot drive for a while. We compared making the recipe cheaper, for example from wood, with handing each player a vehicle item without crafting. A cheap recipe still needs a crafting table and has to avoid the shapes of vanilla wood recipes. A broken vehicle drops its item again (0008), so one item is enough to keep a vehicle for good.

## Decision

- On joining the world, a player receives one item of each starter kind they have yet to receive, including in Creative mode. Give each item to the player or drop it at their feet when their inventory is full.
- Listen to `world.afterEvents.playerSpawn` with `initialSpawn`, which fires on every join and skips respawns after death. After giving each item, record receipt in a per-kind player dynamic property. The SUV keeps `yasu_ride:starter_received`. The bulldozer uses `yasu_ride:bulldozer_starter_received` (0136). A returning player receives any newly introduced starter on their next join.
- Crafting (0008) stays, so more vehicles can still be crafted

## Consequences

- A new player can drive right away, and the crafting cost of 0008 only applies to extra vehicles
- A player who loses the item (for example by dying with it in a lava pit) does not get another one; they craft it or ask an operator for `/give`
- The dynamic property lives in the player data of the world. A new world, or deleting a player's data, gives the item again
- The in-game tests have no players, so joining is covered by unit tests of the use case and the manual test
- Revisit when the Workstation recipe of sub-project 3 changes what a vehicle costs, or if players often lose their only item
