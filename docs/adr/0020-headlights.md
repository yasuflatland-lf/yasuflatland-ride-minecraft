# 0020. Headlights that light up the road

- Status: Accepted
- Date: 2026-10-11

## Context

Driving at night is hard because the vehicle's lamps are only painted on. We want the driver to switch the headlights on and off, and the road ahead to get brighter while they are on.

Switching needs an input a rider can give on both PC and mobile. Jump is the handbrake (0005) and sneak gets out of the vehicle, and the stable Script API (0001) exposes no other buttons. A custom slash command works, but on mobile it means opening the chat and typing. Using an item works the same way on both: right-click on PC, tap on mobile.

An entity cannot emit block light. The only way to light up the world with the stable API is to place light blocks. `minecraft:light_block_15` has no collision, is invisible unless the player holds a light block, and can be replaced by any block; BDS accepts it (in-game test `headlights_follow_and_clear`, 2026-10-11).

## Decision

- A new item, the headlight switch (`mycar:headlight_switch`), is crafted shapeless from a lever and glowstone dust. Using it while riding a vehicle switches that vehicle's headlights. The script listens to `world.afterEvents.itemUse`, and also to `world.beforeEvents.playerInteractWithEntity` when the rider aims at the vehicle they ride; that interaction is cancelled so it does nothing else
- Only the driver (0019) can switch them. A switch within `SPEC.headlightSwitchCooldown` (5 ticks) of the last one is ignored, so one tap that reaches the script through both events counts once
- The state lives in the entity property `mycar:headlights` (bool, default `false`, `client_sync`), so it survives `/reload` and restarts. A placed vehicle starts with them off
- The vehicle's beam pattern picks cells ahead of its center, one block above the ground it stands on. Each tick while the headlights are on, `CellLayer` updates those cells outside camp space (0129). It places lights into air or another light block and clears a cell only if it still holds the exact light block id the vehicle laid. This preserves solid blocks and replacement lights of a different level
- The layer rechecks wanted lights every 20 lays (0096). It restores lights replaced by air or a different light block
- The cells a vehicle lit are saved in its dynamic property `yasu_ride:lit_cells` as entries of the form `{ x, y, z, block: { level } }`, so they can be cleared after a `/reload` or a restart. Older flat entries still load and default to level 15 when the level is absent. The layer also clears tracked cells when the vehicle is broken (0008), stops being loaded, or leaves the dimension (0024)
- Light blocks count as air for the step-up look-ahead (0004) and for placing a vehicle (0008), so a vehicle never climbs or refuses its own light
- The lamp lenses (cubes with the `light` swatch: headlights and fog lamps) move from `body` to a new bone `headlights`, a child of `body`. The `light` swatch has alpha 0 in every paint texture. The render controller gives the `headlights` bone the material `entity` (ignores alpha) while the headlights are off and `entity_emissive` (alpha 0 is fully lit) while they are on

## Consequences

- The road ahead is lit at night, and the lamps glow even in the dark
- `headlights` joins the bone names of 0009. A Blockbench model needs that bone, and an emissive mask in the alpha channel of its lamp texels
- A vehicle removed before the script can read its saved cells can leave its light blocks behind. Any block placed there replaces them
- Clearing and placing cells as the beam moves makes the engine recompute light. Revisit the reach or the cell count if many vehicles drive at night on a server
- The in-game tests cannot use an item without a player, so they set the property directly; the item handling is covered by unit tests and the manual test
