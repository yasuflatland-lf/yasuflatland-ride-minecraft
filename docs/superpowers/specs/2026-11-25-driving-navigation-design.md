# Driving navigation: a nav item for explorer maps, and a radar for nearby places

## Intent

The owner drives a car or the scooter across the world and wants to see a map while driving, for two reasons:

1. To explore: be told "there is something here" about places such as villages and ruins, and head for them.
2. To drive to another logged-in player.

The second need is already met by the vanilla Player Locator Bar (Bedrock, since the Chase the Skies update in June 2025), which shows the direction of every other player above the hotbar and stays visible while riding. This design builds only the first need, in two parts:

- **Nav (far):** a held item used from the driver's seat opens a menu of destination types. Choosing one gives the driver a vanilla explorer map marked with the nearest place of that type. Held in the off hand, the map stays on screen while driving.
- **Radar (near):** while driving, the script looks for telltale mobs in the loaded area around the vehicle and tells the driver in the action bar, for example "NE 140 m: Village".

## Goals

- Item `yasu_ride:nav` (name is the builder's call within ADR 0047). Using it while riding as the driver opens a form listing the destination types this Bedrock version can put on an explorer map. Choosing one puts an explorer map for the nearest such place, searched from the vehicle's position, into the driver's inventory (dropped at their feet if full).
- No use limit and no cooldown beyond the usual double-press guard for held items. Limits can be added later if they turn out to be needed.
- Radar on every kind (SUV, camper, scooter, sports boat, bulldozer) while a driver is in seat 0. It reports a detected place to the driver only, with compass direction (8 points), horizontal distance rounded to 10 m, and the place's name.
- Each detected place is reported once per driver and drive; it is not repeated every tick while it stays in range.
- Check the Player Locator Bar on the dev BDS (game rule and world setting) and document how to turn it on in the player docs. No code for this.

## Non-goals

- No always-on minimap or HUD overlay. No JSON UI changes.
- No new way to locate other players beyond the Locator Bar.
- The radar does not detect places without characteristic mobs (ruined portals, trail ruins, buried treasure, ancient cities, strongholds). Those are found through the nav maps only. Scanning blocks while driving is too expensive.
- No use of the nav item outside a vehicle, and no crafting recipe for explorer maps. How a player obtains the nav item itself (recipe, creative-only, or given with the vehicle) follows the existing items such as the booster.

## Anti-goals

- The radar must never cost noticeable tick time while driving. It must not scan blocks, and it must spread its entity queries over ticks.
- The radar must not hide existing driving hints (ADR 0224 and `src/domain/vehicle/hints.ts`) or the headlight/booster feedback in the action bar; when both want the action bar, the existing message wins and the radar message waits.
- The nav must never give a map that points somewhere other than the nearest unexplored place of the chosen type, searched from where the driver is, and must never hang the server on a long structure search.
- Nothing here may use a beta Script API, an experimental toggle, or `@minecraft/server-gametest` (ADR 0001).

## Constraints

- Stable Script API `@minecraft/server` 2.11 has no structure-locating call. `runCommand("locate ...")` returns only a `CommandResult` with a success count, so the script cannot read structure coordinates. `Dimension.getBiome` only reads loaded positions.
- Explorer maps come from the loot table function `exploration_map` with a `destination`. A `/loot` command executed at the driver searches from the player's position; the origin used by the stable `LootTableManager.generateLootFromTable` remains unverified (see Spike results).
- Bedrock's list of valid `destination` values is not documented in full. Microsoft's example uses `buriedtreasure`; community lists mention mansion, monument, jungle temple, swamp hut, village variants and trial chambers. The menu offers only values confirmed in game.
- Layer, feature and kind rules (ADR 0012, 0046, 0055, 0072, 0090) hold and are checked by `pnpm lint:deps`. Per-kind values follow ADR 0050; the radar range and timing are shared values in one spec constant, not per kind, unless a kind needs a different value.
- Pack changes need a Resource Pack manifest bump (ADR 0015) and paths within the ADR 0047 layout and 80-character limit.
- An off-hand map is visible only in first person. In flight form the vehicle switches the rider to third person (ADR 0028), so the map is not visible while flying. Accepted.

## Approaches

1. **Nav maps only.** Pack JSON plus a small script. Finds far, unexplored places, but one place per map and nothing automatic.
2. **Radar only.** Script-only, automatic, but limited to the loaded area (render distance, roughly 100 to 200 blocks) and to places with characteristic mobs.
3. **Both (chosen).** Nav for far places, radar for what is just past the fog. Most work, but covers both "where should I go" and "what did I just drive past".

For obtaining maps, the owner chose a nav item used from the driver's seat (A) over a crafting recipe per destination (B) and both (C), because it fits exploring by vehicle and is quick to use for family and friends on the home server.

## Design

### Nav

1. The nav item joins the held-item switch route table in `src/infrastructure/vehicle/bedrock/subscriptions.ts`, as the booster does (`boosterSwitchTarget`). Only the driver in seat 0 gets the menu; a passenger or a player on foot gets an action-bar message such as "Use the nav from the driver's seat".
2. The menu is an `ActionFormData` built like the warp menus (`src/infrastructure/shared/choiceForm.ts`), one button per confirmed destination type, with translated labels in `texts/*.lang`.
3. Each destination type maps to one loot table in the Behavior Pack (`loot_tables/yasu_ride/nav_<type>.json`, one `exploration_map` entry). The domain holds the list of destination types as data; the infrastructure maps each to its loot table path.
4. If the engine finds no structure of the selected type, the driver gets "Nothing found nearby" and no item.

### Radar

1. A radar target is a place type with its detecting mob types, for example:
   - Village: `minecraft:villager`, `minecraft:iron_golem`
   - Pillager outpost: `minecraft:pillager`
   - Ocean monument: `minecraft:guardian`, `minecraft:elder_guardian`
   - Woodland mansion: `minecraft:vindicator`, `minecraft:evoker`
   - Witch hut: `minecraft:witch`
     The final list is the builder's, kept as data in the domain.
2. Every N ticks (spec constant), for one driven vehicle per tick in turn, query `dimension.getEntities` for the target types within the radar radius of the vehicle. Group hits that are close together into one place (cluster radius in the spec), so a village with 12 villagers is one report.
3. A place is identified by its type and a coarse cell of its cluster centre. The drive remembers reported place ids for the current driver; a new driver starts empty. Nothing is saved.
4. The report uses the vehicle position at report time: compass direction from the vehicle to the cluster centre and the horizontal distance.
5. The pure parts (clustering, place id, direction and distance, report de-duplication, scheduling one vehicle per tick) are domain functions with property-based tests (ADR 0010). The entity query and the action bar are infrastructure.

### Docs

- New spec `docs/specs/navigation.md` (or a section in `driving.md`, builder's call) and an ADR for the decision to locate places through explorer-map loot tables and mob-based radar under the stable-API constraint.
- Player doc page for the nav item under `docs/items/`, including how to hold a map in the off hand on PC and on touch, and how to turn on the Locator Bar.

## Spike (before the plan's implementation tasks)

Throwaway, on the dev BDS:

1. Which `destination` values produce a working explorer map on the current Bedrock version.
2. Whether `generateLootFromTable` searches from a meaningful origin; if not, whether `/loot give <driver> loot <table>` run at the driver does.
3. How long a far search (mansion) blocks the tick.
4. Whether an off-hand filled map renders while riding a vehicle in first person, on PC and on iPad.
5. Whether the Locator Bar is on by default on the dev BDS.

The plan adjusts the Nav part to what the spike shows.

## Left to the builder

- Item name, icon and texture, and how players obtain the nav item, following the booster.
- Radar radius, scan interval, cluster radius, and the exact target list.
- Whether the radar code lives in the vehicle feature or a new `navigation` feature. It needs the driver and vehicle position, which live in the vehicle feature, so the vehicle feature is the likely home (a new core subfolder `navigation/` would be added to ADR 0090's list).
- In-game scenarios for the nav (driver gets a map, passenger refused) and the radar (summoned villagers near a driven vehicle produce one report).

## Calls made after the builder check

These were settled by the designer, not the owner. The owner can overturn any of them while reading the plan.

1. **Nearest unexplored, not plain nearest.** Nav maps keep the vanilla explorer-map behavior of skipping already generated chunks, because the intent is to find something new. A map never points back at a village the driver already passed. The longer search is why spike step 3 measures tick time.
2. **Spike outcomes that cut scope.**
   - Search origin: if `generateLootFromTable` does not search from the driver, use `/loot give` executed at the driver (`execute as <driver> at @s run loot ...`). If neither searches from the driver, the nav is dropped from the plan and the radar ships alone; the owner is told.
   - Tick time: a destination whose search blocks one tick for more than 1 second (20 ticks) on the dev BDS is left off the menu.
   - Nothing found: if the script can tell (no item, or an item without map data), the driver gets "Nothing found nearby". If it cannot, whatever vanilla hands over is accepted and the player doc says so.
3. **Off-hand map not drawn while riding.** If spike step 4 shows this, the nav still ships (the map can be read from the main hand or while stopped), the player doc says so, and the owner is told. No HUD is added to compensate.
4. **Action bar sharing stays local to the vehicle feature.** The vehicle feature's action-bar writers (`BedrockHintWorld`, rider feedback in `bedrockVehicleRiders.ts`, camper decor) go through one small per-player "last written" record in vehicle infrastructure. The radar writes only when no other vehicle message was written for that player in the last 60 ticks (spec constant). A held report is re-measured from the vehicle's current position when it is shown, dropped if the place is now outside the radar radius, and counts as reported only once shown. Messages from other features (camp, resort) are not tracked; a driver rarely triggers them.
5. **Overworld only for the nav.** In the Nether or the End, using the nav shows "The nav only works in the Overworld" and opens no menu. The radar runs in every dimension; its targets are simply absent elsewhere.

## Spike results

On 2026-11-25, a re-run on dev BDS 1.26.66.1 with natural terrain and a connected player produced a `minecraft:filled_map` for each destination below. Each loot table had one pool and one `minecraft:map` item entry with the `exploration_map` function and its `destination`, without decoration or zoom. The earlier flat-world spike found no filled maps because its entries used `minecraft:empty_map`, which yields a blank map.

**Confirmed menu order (`NavDestination`):** `buriedtreasure`, `mansion`, `monument`, `village`, `jungle_temple`, `swamp_hut`, `trial_chambers`, `pillager_outpost`, `shipwreck`, `ruins`.

- **Search origin and delivery.** `execute as <player> at @s run loot give @s loot "yasu_ride/<table>"` searched from the player's position: the map center moved with the player, and the monument map pointed the right way. The table name omits `loot_tables/` and `.json`; quote the path containing a slash. The prefixed file form (`loot_tables/yasu_ride/<table>.json`) and the loot manager's search origin were not verified. The item arrives as `minecraft:filled_map`, with the map ID as its data value, so inventory queries must ignore data.
- **Markers and search scope.** Markers were seen for monument, village, and jungle temple on PC and iPad. The other seven maps were filled, but their markers were not inspected. The search skips already generated chunks and finds the nearest unexplored place. Setting `skip_existing_chunks:false` showed no visible change, so keep the default.
- **Search cost.** The earlier timings measured blank maps from `empty_map` entries, not successful searches. The cost of a successful distant search and the 20-tick cutoff remain to be checked.
- **Remaining human checks.** Check full-inventory delivery and menu cancellation on natural terrain, the off-hand map while riding an SUV in first person on PC and iPad, and the Locator Bar with a second player online. The earlier fresh-world console listing reported `locatorbar = true` and `playerWaypoints = everyone`.
