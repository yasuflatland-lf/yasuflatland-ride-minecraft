# Driving Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a driver find places worth exploring: a nav item that hands out vanilla explorer maps, and a radar that names nearby villages and other mob-marked places in the action bar.

**Architecture:** Both parts live in the vehicle feature. Pure rules (radar geometry, clustering, de-duplication, the destination list) go in a new core subfolder `src/domain/vehicle/navigation/`. Two use cases (`ScanForPlaces`, `OpenNav`) in `src/application/vehicle/` talk to Bedrock through ports. Explorer maps come from Behavior Pack loot tables using `exploration_map`; nothing locates structures from script.

**Tech Stack:** TypeScript, `@minecraft/server` 2.11 and `@minecraft/server-ui` 2.3 (stable only), vitest + fast-check, esbuild, Python generators for item textures.

**Spec:** `docs/superpowers/specs/2026-11-25-driving-navigation-design.md` (read its "Calls made after the builder check" section; those calls are binding here).

## Global Constraints

- Stable Script API only; no beta APIs, experimental toggles or `@minecraft/server-gametest` (ADR 0001).
- `src/infrastructure` → `src/application` → `src/domain`; only infrastructure imports `@minecraft/server` (ADR 0012). The vehicle core cannot import `motion/` or `kinds/` (ADR 0055). `pnpm lint:deps` must pass.
- IDs use `yasu_ride:<snake_case>`; pack files under `<type>/yasu_ride/`, paths at most 80 characters counting the pack folder (ADR 0047).
- Every tuning value lives in `SPEC` (`src/domain/vehicle/spec.ts`); no magic numbers elsewhere.
- Bump the Resource Pack manifest version in any task that changes tracked Resource Pack files or generator inputs (ADR 0015).
- Everything committed is English; `texts/ja_JP.lang` gets Japanese strings as the locale exception.
- Commit messages: one imperative line, no body, no trailers.
- Nav works in the Overworld only. Nav maps point at the nearest **unexplored** place (vanilla skip-existing-chunks behavior kept).
- The radar never scans blocks, queries one vehicle per scan, and writes the action bar only when no other vehicle-feature message was written to that player in the last `SPEC.radarQuietTicks` (60) ticks.

## Review Focus

1. A village straddling two cluster cells, or villagers walking across a cell edge, must still be reported once per drive. Test: Task 2 "a wandering cluster near a cell edge is reported once".
2. Driver handover (seat 0 empties and a passenger moves up, ADR 0078) must start the new driver with an empty report memory. Test: Task 4 "a new driver hears places the previous driver already heard".
3. A report held during a quiet period must not be shown with the old direction after the vehicle turned or drove on. Test: Task 2 "a held report is re-measured from the current position" and "is dropped outside the radius".
4. Using the nav while the form is still open from a previous press, or after leaving the seat while the form is open, must not hand out a map to a non-driver. Test: Task 6 "re-checks the driver after the form closes".
5. Vehicle removed or unloaded mid-scan, or the driver leaving the game, must not throw from the scan tick. Test: Task 4 "skips vehicles whose position is unknown".

---

### Task 1: Spike on the dev BDS (throwaway, no commit of code)

**Files:**

- Modify: `docs/superpowers/specs/2026-11-25-driving-navigation-design.md` (append a "Spike results" section)

- [ ] **Step 1:** On a scratch branch, add one loot table per candidate destination (`buriedtreasure`, `mansion`, `monument`, `village`, `jungle_temple`, `swamp_hut`, `trial_chambers`, `pillager_outpost`, `shipwreck`, `ruins`) and a throwaway script event that runs both `world.getLootTableManager().generateLootFromTable(...)` and `player.runCommand("loot give @s loot yasu_ride/nav_<type>")`.
- [ ] **Step 2:** For each destination record: does a filled map with a marker result; which call searches from the player's position; the tick duration of the call (log `Date.now()` before and after); what a search with nothing in range returns.
- [ ] **Step 3:** Ride an SUV in first person with a filled map in the off hand on PC and on iPad; record whether the map is drawn. Record whether the Player Locator Bar is shown on the dev BDS by default and which game rule controls it.
- [ ] **Step 4:** Append "Spike results" to the design doc: the confirmed destination list in menu order, the chosen give path (`loot` or `command`), destinations dropped for exceeding 20 ticks, how "nothing found" is detected (or that it cannot be), the off-hand result, the Locator Bar rule name. Delete the scratch branch.
- [ ] **Step 5:** Commit the doc change: `git commit -m "Record the navigation spike results"`.

If no give path searches from the player, stop after Step 4, skip Tasks 6 and 7, and tell the owner the nav is dropped (design, call 2).

### Task 2: Radar geometry and memory in the domain

**Files:**

- Create: `src/domain/vehicle/navigation/radar.ts`
- Modify: `src/domain/vehicle/spec.ts`
- Test: `tests/domain/vehicle/navigation/radar.test.ts`

**Interfaces:**

- Produces:
  - `type RadarPlaceType = "village" | "pillager_outpost" | "ocean_monument" | "woodland_mansion" | "witch_hut"`
  - `const RADAR_TARGETS: readonly { place: RadarPlaceType; mobs: readonly string[] }[]` with mobs `village: ["minecraft:villager_v2", "minecraft:iron_golem"]`, `pillager_outpost: ["minecraft:pillager"]`, `ocean_monument: ["minecraft:guardian", "minecraft:elder_guardian"]`, `woodland_mansion: ["minecraft:vindicator", "minecraft:evoker"]`, `witch_hut: ["minecraft:witch"]`
  - `interface RadarHit { place: RadarPlaceType; location: Vec3 }`
  - `interface RadarPlace { id: string; place: RadarPlaceType; center: Vec3 }`
  - `function clusterHits(hits: readonly RadarHit[]): RadarPlace[]`
  - `type CompassPoint = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw"`
  - `interface RadarReport { place: RadarPlaceType; direction: CompassPoint; distance: number }`
  - `function measure(from: Vec3, place: RadarPlace): RadarReport | undefined` (undefined beyond `SPEC.radarRadius`)
  - `class RadarMemory { offer(places: readonly RadarPlace[]): void; next(from: Vec3): RadarReport | undefined }`
  - `SPEC.radarRadius = 128`, `SPEC.radarScanInterval = 20`, `SPEC.radarClusterRadius = 48`, `SPEC.radarPlaceCell = 96`, `SPEC.radarQuietTicks = 60`

- [ ] **Step 1: Write the failing tests** (fast-check properties, few examples)
  - "clusters hits of one type within radarClusterRadius into one place": any set of same-type hits inside a 48-block disc yields exactly 1 place.
  - "keeps different place types apart": a villager and a witch at the same spot yield 2 places.
  - "place id is stable while the cluster centre stays in its cell": id = `${place}:${floor(cx/96)}:${floor(cz/96)}`.
  - "a wandering cluster near a cell edge is reported once": offering the same village whose centre moves across a cell edge by less than `radarClusterRadius` produces one report from `RadarMemory`. (Memory treats a new place as known when a known place of the same type lies within `radarClusterRadius` of its centre.)
  - "compass point": `measure({x:0,y:64,z:0}, place at {x:0,z:-100})` → `"n"`; `{x:100,z:0}` → `"e"`; `{x:70,z:70}` → `"se"` (Minecraft +x is east, +z is south).
  - "distance is horizontal and rounded to 10": `{x:0,y:0,z:0}` to `{x:134,y:40,z:0}` → `130`; property: result is a multiple of 10 and within 5 of the horizontal distance.
  - "a held report is re-measured from the current position": offer a place, call `next` from two different `from` points; the second report's direction and distance match the second point.
  - "is dropped outside the radius": `next(from)` returns undefined while the only pending place is more than 128 blocks away; the place stays pending and is reported once the vehicle is back within range.
  - "reports each place once": offering the same place repeatedly yields one report in total.

- [ ] **Step 2:** Run `pnpm test tests/domain/vehicle/navigation/radar.test.ts`; expect failures for missing module.
- [ ] **Step 3:** Implement `radar.ts` and the `SPEC` values. `clusterHits` is greedy single-link by type, centre = mean of members. `RadarMemory.next` returns the nearest in-range pending place, moves it to reported, and returns its report.
- [ ] **Step 4:** Run the test file and `pnpm lint:deps`; expect pass.
- [ ] **Step 5:** Commit: `Add radar place clustering and report memory`.

### Task 3: Driver accessor and an action bar log for the vehicle feature

**Files:**

- Modify: `src/domain/vehicle/vehicle.ts` (add getter)
- Create: `src/infrastructure/vehicle/bedrock/actionBarLog.ts`
- Modify: `src/infrastructure/vehicle/bedrock/bedrockVehicleRiders.ts:104-108`, `src/infrastructure/vehicle/bedrock/bedrockHintWorld.ts:112-120`, `src/infrastructure/vehicle/kinds/camper/bedrockDecorWorld.ts:60`, `src/infrastructure/vehicle/install.ts`
- Test: `tests/domain/vehicle/vehicle.test.ts`, `tests/infrastructure/vehicle/bedrock/actionBarLog.test.ts`

**Interfaces:**

- Produces:
  - `Vehicle.get driverId(): PlayerId | undefined` (the seat 0 rider, `this.crew.driver`; not the deck driver).
  - `class ActionBarLog { write(player: Player, text: ActionBarMessage): void; quietSince(playerId: PlayerId, tick: number): boolean }` where `quietSince` is true when no write to that player happened in the last `SPEC.radarQuietTicks` ticks. `ActionBarMessage` is the type from `src/infrastructure/shared/players.ts`.

- [ ] **Step 1: Write the failing tests**
  - vehicle: "driverId is the seat 0 rider and undefined when seat 0 is empty" (use `rebuildVehicle` with a driver and with only a passenger).
  - actionBarLog: "is quiet for a player never written", "is not quiet 59 ticks after a write", "is quiet 60 ticks after a write", "tracks players separately". Use a fake player with `id` and `onScreenDisplay.setActionBar = vi.fn()` and a tick source passed to the constructor: `new ActionBarLog(() => tick)`.
- [ ] **Step 2:** Run both test files; expect failures.
- [ ] **Step 3:** Add the getter; implement `ActionBarLog` (it swallows the throw from a player who left, like `BedrockHintWorld.setActionBar`). Construct one `ActionBarLog(() => system.currentTick)` in `install.ts` and pass it to `BedrockVehicleWorld` (riders), `BedrockHintWorld` and the camper decor world, replacing their direct `setActionBar` calls.
- [ ] **Step 4:** Run `pnpm test` (existing riders, hints and decor tests must still pass) and `pnpm typecheck`.
- [ ] **Step 5:** Commit: `Route vehicle action bar messages through one log`.

### Task 4: ScanForPlaces use case

**Files:**

- Create: `src/application/vehicle/scanForPlaces.ts`
- Modify: `src/application/vehicle/ports/drive.ts` (add `RadarWorld`)
- Test: `tests/application/vehicle/scanForPlaces.test.ts` (use `InMemoryRepo`, `FakeClock` from `./fakes`)

**Interfaces:**

- Consumes: Task 2 `RADAR_TARGETS`, `clusterHits`, `RadarMemory`, `RadarReport`; Task 3 `Vehicle.driverId`.
- Produces:
  - `interface RadarWorld { position(vehicleId: VehicleId): { dimensionId: DimensionId; location: Vec3 } | undefined; mobsNear(dimensionId: DimensionId, center: Vec3, radius: number, types: readonly string[]): readonly { typeId: string; location: Vec3 }[]; isQuiet(playerId: PlayerId): boolean; showReport(playerId: PlayerId, report: RadarReport): void }`
  - `class ScanForPlaces { constructor(world: RadarWorld, repo: VehicleRepository); execute(): void }` — called every `SPEC.radarScanInterval` ticks.

- [ ] **Step 1: Write the failing tests**
  - "scans one driven vehicle per call, in turn": with three driven vehicles, three calls query `mobsNear` once each, for each vehicle once.
  - "ignores vehicles without a driver".
  - "shows a report to the driver only when quiet": with `isQuiet` false nothing is shown; the next quiet call shows it.
  - "a new driver hears places the previous driver already heard": memory is keyed by `(vehicleId, driverId)` and dropped when the driver changes.
  - "skips vehicles whose position is unknown": `position` returns undefined; no throw, no query.
  - "forgets memory of vehicles that are gone": after `repo.remove`, the next call drops its entry (assert via a later re-added vehicle with the same id and driver getting the report again).
- [ ] **Step 2:** Run; expect failures.
- [ ] **Step 3:** Implement. Map each mob hit to its `RadarPlaceType` through `RADAR_TARGETS`.
- [ ] **Step 4:** Run the test file; expect pass.
- [ ] **Step 5:** Commit: `Add the radar scan use case`.

### Task 5: Radar in Bedrock

**Files:**

- Create: `src/infrastructure/vehicle/bedrock/bedrockRadarWorld.ts`
- Modify: `src/infrastructure/vehicle/bedrock/handlers/drive.ts` (third interval), `src/infrastructure/vehicle/bedrock/subscriptions.ts` and `src/infrastructure/vehicle/install.ts` (wire `ScanForPlaces`), `src/infrastructure/vehicle/bedrock/identifiers.ts` (`radarKey(place)`, `compassKey(point)`)
- Modify: `packs/yasu_ride_rp/texts/en_US.lang`, `packs/yasu_ride_rp/texts/ja_JP.lang`, `packs/yasu_ride_rp/manifest.json`, `packs/yasu_ride_bp/manifest.json` (dependency version)
- Create: `src/infrastructure/vehicle/testHooks/testRadar.ts`, `src/test-pack/scenarios/radar.ts`
- Modify: `src/test-pack/catalog.ts`, `src/test-pack/scenarios/index.ts`, `src/test-pack/features.ts` (tag `vehicle:radar`)
- Test: `tests/infrastructure/vehicle/bedrock/bedrockRadarWorld.test.ts`, `tests/packs/radar.test.ts`

**Interfaces:**

- Consumes: Task 3 `ActionBarLog`; Task 4 `RadarWorld`, `ScanForPlaces`.
- Produces: lang keys `yasu_ride.radar.report` = `%1 %2 m: %3` (direction, distance, place), `yasu_ride.radar.place.<place>` (en: Village, Pillager outpost, Ocean monument, Woodland mansion, Witch hut), `yasu_ride.radar.dir.<point>` (en: N, NE, E, SE, S, SW, W, NW); ja_JP gets Japanese translations of each.

- [ ] **Step 1: Write the failing tests**
  - adapter: "mobsNear asks the dimension for each type within the radius" (mock `dimension.getEntities` called with `{ location, maxDistance: radius, type }` per type) and "returns nothing when the dimension throws".
  - adapter: "showReport writes one translated message through the log".
  - pack: "every radar place and compass point has an en_US and ja_JP lang key".
- [ ] **Step 2:** Run; expect failures.
- [ ] **Step 3:** Implement the adapter and register `system.runInterval(() => radar.execute(), SPEC.radarScanInterval)` after the hints interval. Add a test hook (as in `testBoost.ts`) that captures reports for a test vehicle without a player.
- [ ] **Step 4:** Add the in-game scenario `suv_radar_village`: summon an SUV and 3 villagers 60 blocks north-east with `summon`, drive via the test hook, assert exactly one captured report `{ place: "village", direction: "ne" }` over 100 ticks. Catalog: `features: ["vehicle:radar", "vehicle:suv"]`, `isolation: "lane"`, `needsPlayer: false`, `vehicles: 1`, measured ticks.
- [ ] **Step 5:** Bump the RP manifest version and the BP dependency. Run `pnpm test`, `pnpm build`, `pnpm server:restart`, `GAME_TEST_FEATURES=vehicle:radar pnpm test:game`; expect pass.
- [ ] **Step 6:** Commit: `Report nearby villages and other places to the driver`.

### Task 6: OpenNav use case

**Files:**

- Create: `src/domain/vehicle/navigation/destinations.ts`, `src/application/vehicle/openNav.ts`
- Modify: `src/application/vehicle/ports/drive.ts` (add `NavWorld`)
- Test: `tests/domain/vehicle/navigation/destinations.test.ts`, `tests/application/vehicle/openNav.test.ts`

**Interfaces:**

- Consumes: Task 3 `Vehicle.driverId`; Task 1 confirmed destination list.
- Produces:
  - `type NavDestination` = string union of the confirmed destinations, in menu order; `const NAV_DESTINATIONS: readonly NavDestination[]`.
  - `interface NavWorld { dimensionOf(playerId: PlayerId): DimensionId | undefined; choose(playerId: PlayerId, options: readonly NavDestination[]): Promise<NavDestination | undefined>; giveMap(playerId: PlayerId, destination: NavDestination): "given" | "nothing" | "unknown"; showMessage(playerId: PlayerId, name: string): void }`
  - `class OpenNav { constructor(repo: VehicleRepository, world: NavWorld); execute(cmd: { playerId: PlayerId; vehicleId: VehicleId }): Promise<void> }`
  - Messages: `nav_driver_only`, `nav_overworld_only`, `nav_nothing_found`.

- [ ] **Step 1: Write the failing tests**
  - destinations: "lists each destination once".
  - "a passenger gets nav_driver_only and no menu".
  - "outside minecraft:overworld gets nav_overworld_only and no menu".
  - "the driver choosing a destination gets that map": `giveMap` called once with the choice.
  - "a cancelled menu gives nothing".
  - "re-checks the driver after the form closes": the driver leaves seat 0 while `choose` is pending; `giveMap` is not called.
  - "nothing found shows nav_nothing_found"; `"unknown"` shows nothing.
- [ ] **Step 2:** Run; expect failures.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run; expect pass.
- [ ] **Step 5:** Commit: `Add the nav use case`.

### Task 7: Nav item, loot tables and menu in Bedrock

**Files:**

- Create: `packs/yasu_ride_bp/items/yasu_ride/nav.item.json` (copy of `booster.item.json` with `yasu_ride:nav` and icon `yasu_ride_nav`)
- Create: `packs/yasu_ride_bp/loot_tables/yasu_ride/nav_<destination>.json`, one per `NAV_DESTINATIONS` entry: one pool, item `minecraft:empty_map`, functions `exploration_map` with the destination and the zoom/decoration the spike found working
- Modify: `tools/suv_export.py` (`nav_icon`, 16x16: a folded map with a red marker), `tools/item_texture_base.json`, `tools/generators.json`
- Create: `src/infrastructure/vehicle/bedrock/handlers/navSwitch.ts`, `src/infrastructure/vehicle/bedrock/bedrockNavWorld.ts`
- Modify: `src/infrastructure/vehicle/bedrock/identifiers.ts` (`NAV_TYPE = id("nav")`, `navLootTable(destination)`), `subscriptions.ts` (route `[NAV_TYPE]: () => [nav]`), `install.ts`
- Modify: lang files (item name `Nav` in en_US and its Japanese translation in ja_JP, menu title, one label per destination, the three messages), both manifests
- Create: `src/test-pack/scenarios/nav.ts`; modify catalog, scenario index, features (`vehicle:nav`)
- Test: `tests/packs/nav.test.ts`, `tests/infrastructure/vehicle/bedrock/subscriptions.test.ts` (route), `tests/infrastructure/vehicle/bedrock/bedrockNavWorld.test.ts`

**Interfaces:**

- Consumes: Task 6 `OpenNav`, `NavWorld`, `NAV_DESTINATIONS`.

- [ ] **Step 1: Write the failing tests**
  - pack: "every nav destination has a loot table at the ADR 0047 path with an exploration_map function naming it", "the nav item has en_US and ja_JP names", "every destination has a menu label".
  - subscriptions: "routes nav item uses to the nav target" (mirror the booster route test).
  - adapter: "giveMap uses the path chosen in the spike", "falls back to dropping the map at the player's feet when the inventory is full", "choose maps the form answer to a destination and a cancel to undefined" (mock `chooseFromForm`).
- [ ] **Step 2:** Run; expect failures.
- [ ] **Step 3:** Implement the switch target like `boosterSwitchTarget` (claims item use when riding a vehicle, calls `openNav.execute`), the adapter with `chooseFromForm(player, "yasu_ride.nav.title", entries)`, the pack files and the icon generator. Run `pnpm model` for the texture and preview.
- [ ] **Step 4:** Add the in-game scenario `suv_nav_passenger_refused` (a test passenger uses the nav through the test hook; no form opens, the message is `nav_driver_only`). The driver-gets-a-map path needs a form answer, so it is a manual check in `docs/manual-test.md`.
- [ ] **Step 5:** Bump both manifests. Run `pnpm test`, `pnpm model:check`, `pnpm build`, `pnpm server:restart`, `GAME_TEST_FEATURES=vehicle:nav pnpm test:game`; expect pass. Do the manual check on PC once.
- [ ] **Step 6:** Commit: `Add the nav item that hands out explorer maps`.

### Task 8: Docs

**Files:**

- Create: `docs/specs/navigation.md` (rules for nav and radar in the spec format of `docs/specs/warp.md`), `docs/adr/0261-navigation-by-explorer-maps-and-mob-radar.md`, `docs/items/nav.md` (how to use, off hand on PC and touch, Locator Bar rule from the spike)
- Modify: `docs/adr/0090-*.md` (add `navigation/` to the subfolder list), `docs/specs/README.md`, `docs/manual-test.md`, `README.md` item list if it lists items
- [ ] **Step 1:** Write the docs; the ADR records the stable-API constraint, the three approaches and the owner's choices.
- [ ] **Step 2:** Run `pnpm run docs`, `pnpm lint:docs`, `pnpm lint:lang`; expect pass.
- [ ] **Step 3:** Commit: `Document driving navigation`.

### Task 9: Final verification

- [ ] Run `pnpm lint`, `pnpm lint:lang`, `pnpm lint:docs`, `pnpm lint:unused`, `pnpm lint:deps`, `pnpm typecheck`, `pnpm test`, `pnpm model:check`, `pnpm build`, `pnpm server:restart`, `pnpm test:game`; all pass.
