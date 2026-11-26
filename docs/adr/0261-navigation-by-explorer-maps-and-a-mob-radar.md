# 0261. Navigation by explorer maps and a mob radar

- Status: Proposed
- Acceptance condition: Confirm the radar in game and resolve the player-origin map check before including the nav item.
- Date: 2026-11-25
- Related: [0001](0001-bedrock-addon-with-stable-script-api.md): stable Script API
- Related: [0224](0224-third-person-switch-feedback-and-bulldozer-camera.md): driving feedback

## Context

Drivers want somewhere new to explore and a way to notice places they pass. The stable Script API has no structure locate call. Running the locate command returns a `CommandResult` with only a success count, so the script cannot read the coordinates. Vanilla explorer maps can carry a destination marker, and scripts can query mobs in loaded chunks. The vanilla Player Locator Bar covers travel towards another player.

Decided in: #2479 (design and engine spike), which records the engine measurements and outstanding player checks.

## Decision

Propose both explorer maps for distant destinations and automatic radar reports for nearby places. The owner chose a nav item operated by any rider over per-destination crafting recipes, and limited the radar to places identifiable by mobs.

- Open the destination menu for any rider in the Overworld. Follow vanilla exploration-map behavior and search for the nearest unexplored destination from the rider. Prefer the loot manager if its search origin can be verified. Otherwise try the loot command at the rider. If neither path searches from the rider, cancel the nav work and ship the radar alone.
- Include only confirmed destinations whose search takes at most one second (20 nominal ticks). Show “Nothing found nearby” when the script can identify a miss. Otherwise give the vanilla result and document that limitation.
- If the off-hand map does not render while riding, document reading the map in the main hand or while stopped. Keep the nav item without adding a HUD.
- Run the radar in every dimension. Scan one occupied vehicle per interval, cluster nearby mobs by place type, and report a place once per rider and ride. Give other vehicle action-bar messages priority for 60 ticks. Recompute direction and distance before displaying a delayed report and discard the report if the rider is out of range. Count the place as reported only after display.

### Alternatives considered

Maps alone give a driver a distant goal but require an explicit choice for every search. Radar alone gives directions as the driver travels but can only find characteristic mobs in loaded chunks. Using both covers both distances at the cost of maintaining two detection methods.

## Consequences

Mob clusters can suggest a village or outpost even when the mobs moved there independently. Places without characteristic mobs produce no radar report. Each rider receives reports on their existing vehicle action bar. A busy action bar delays only that rider's report. The nav menu depends on measured search cost on the supported engine version. The earlier flat-world spike used `minecraft:empty_map` entries and produced blank maps; a natural-terrain re-run using `minecraft:map` produced filled maps for all ten candidates and confirmed a player-origin give path. The current destination list remains empty until the menu is enabled. Recheck the observations when the engine changes.
