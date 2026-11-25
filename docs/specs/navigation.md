# Navigation

- Scope: Driver access to the Nav item, destination selection and explorer map delivery, and automatic radar reports for places indicated by nearby mobs while driving any vehicle kind.
- Verified at: 4316b7e76
- Source: [0261](../adr/0261-navigation-by-explorer-maps-and-a-mob-radar.md), [0090](../adr/0090-group-the-vehicle-core-by-subcontext.md)

## Rules

### Driver access and selection

- Applies to: Using the Nav item in the air or pressing the vehicle the player is riding.
- Rule: A player outside the driver's seat receives the translated driver-only message. The driver must be in the Overworld to open the destination form. A second press by the same player is ignored while their selection is pending. Cancel gives no item. After a choice, the driver must still be in the driver's seat of the same vehicle before a map can be delivered.
- Agreement: Proposed
- Basis: [0261](../adr/0261-navigation-by-explorer-maps-and-a-mob-radar.md) Decision.
- Implementation: `src/infrastructure/vehicle/bedrock/handlers/navSwitch.ts`, `src/application/vehicle/openNav.ts`, `src/infrastructure/vehicle/bedrock/bedrockNavWorld.ts`.
- Verification: `tests/application/vehicle/openNav.test.ts` checks the order, cancellation, seat recheck, and repeated presses. `tests/infrastructure/vehicle/bedrock/subscriptions.test.ts` checks air and vehicle press routing. The `suv_nav_passenger_refused` scenario checks refusal with two seated probes and awaits an in-game run.

### Menu and map delivery

- Applies to: The destinations offered to an eligible driver.
- Rule: Each confirmed destination has a localized menu label and one loot table at `loot_tables/yasu_ride/nav_<destination>.json`. The form opens with these destinations in order: `buriedtreasure`, `mansion`, `monument`, `village`, `jungle_temple`, `swamp_hut`, `trial_chambers`, `pillager_outpost`, `shipwreck`, and `ruins`. The command adapter has inventory and feet-drop paths. A command success count cannot distinguish a blank map from a filled explorer map.
- Agreement: Proposed
- Basis: [0261](../adr/0261-navigation-by-explorer-maps-and-a-mob-radar.md) Decision and Consequences.
- Implementation: `src/domain/vehicle/navigation/destinations.ts`, `src/infrastructure/vehicle/bedrock/bedrockNavWorld.ts`, `src/infrastructure/shared/choiceForm.ts`.
- Verification: `tests/packs/nav.test.ts` checks that the shipped tables match the destination list and have labels. `tests/infrastructure/vehicle/bedrock/bedrockNavWorld.test.ts` checks form answers and both command paths with test data. Player-origin and rendering checks are in [Manual test](../manual-test.md#nav-explorer-maps).

### Radar scanning and clustering

- Applies to: Vehicles with a current driver.
- Rule: Every 20 ticks, after the vehicle hints interval, the radar takes the next driven vehicle in repository order. It queries loaded mobs within 128 blocks of the vehicle in its current dimension, once per mob type. A missing vehicle position skips the scan. A failed query contributes no hits. Villagers and iron golems indicate villages, pillagers indicate outposts, guardians and elder guardians indicate ocean monuments, vindicators and evokers indicate woodland mansions, and witches indicate witch huts. The radar infers places from mobs, so mobs elsewhere can trigger reports. Same-type hits linked by horizontal gaps of at most 48 blocks form a cluster whose center is the mean position of its hits.
- Agreement: Accepted
- Basis: [0090](../adr/0090-group-the-vehicle-core-by-subcontext.md) Decision, the `navigation/` subfolder for the kind-neutral radar.
- Implementation: `src/domain/vehicle/navigation/radarTargets.ts`, `src/domain/vehicle/navigation/radar.ts`, `src/domain/vehicle/spec.ts`, `src/application/vehicle/scanForPlaces.ts`, `src/infrastructure/vehicle/bedrock/bedrockRadarWorld.ts`, `src/infrastructure/vehicle/bedrock/handlers/drive.ts`. The development hook in `src/infrastructure/vehicle/testHooks/testRadar.ts` forwards the synthetic driver's reports to `src/test-pack/scenarios/radar.ts`.
- Verification: Property tests in `tests/domain/vehicle/navigation/radar.test.ts` cover clustering. Application and adapter tests cover scan rotation, missing positions, and per-type queries. `tests/infrastructure/vehicle/bedrock/subscriptions.test.ts` checks interval order. The BDS scenarios `suv_radar_village` and `sportsboat_radar_monument` summon mobs and check the place and direction reported to a test driver.

### Radar reports and drive memory

- Applies to: The action bar of each driver with pending places.
- Rule: A cluster is already known if its center lies within 48 horizontal blocks of a pending or reported center of the same type in the same dimension. Radar memory belongs to the current driver of each vehicle and is cleared when the vehicle leaves the repository or its driver changes or gets out. On each radar interval, a driver whose action bar has had no write through the vehicle's shared log for at least 60 ticks can receive one report. The radar selects the nearest pending center within 128 horizontal blocks of the vehicle's current position, leaving farther centers pending. It reports one of eight 45-degree compass sectors and the horizontal distance rounded to the nearest ten meters. Both supported locales format the report as direction, distance, and place, for example "NE 120 m: Village" in English.
- Agreement: Accepted
- Basis: [0090](../adr/0090-group-the-vehicle-core-by-subcontext.md) Decision, the `navigation/` subfolder for the kind-neutral radar.
- Implementation: `src/domain/vehicle/navigation/compass.ts`, `src/domain/vehicle/navigation/radar.ts`, `src/application/vehicle/scanForPlaces.ts`, `src/infrastructure/vehicle/bedrock/actionBarLog.ts`, `src/infrastructure/vehicle/bedrock/bedrockRadarWorld.ts`, `packs/yasu_ride_rp/texts/en_US.lang`, `packs/yasu_ride_rp/texts/ja_JP.lang`.
- Verification: Domain properties check compass sectors, distance rounding, center drift, reporting once, re-measurement, and retention outside the radius. Application tests cover quiet timing, driver changes, removal, and dimension changes. Adapter and pack tests cover raw message arguments and the locale keys. The BDS scenario `suv_radar_quiet` writes a vehicle message before summoning villagers and checks the tick of the first report. All three scenarios continue listening for duplicates.

## Open issues

- ADR 0261 calls for maps to the nearest unexplored destination. The [natural-terrain spike re-run](https://github.com/yasuflatland-lf/yasuflatland-ride-minecraft/issues/2496) yielded filled maps for all ten destinations using `minecraft:map`. Markers for the seven destinations other than monument, village, and jungle temple, the no-structure result, and the Locator Bar still need human checks.
- First-person off-hand rendering while driving remains to be checked on PC and touch.
- ADR 0261 calls for discarding out-of-range radar reports. The implementation retains them as pending in `src/domain/vehicle/navigation/radar.ts`. The ADR needs an edit or a superseding ADR.
- Client rendering of the translated radar report still needs an in-game check.
