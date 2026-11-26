# Navigation

- Scope: Rider access to the Nav item, guidance for riders, destination selection and explorer map delivery, and automatic radar reports for places indicated by nearby mobs while riding any vehicle kind.
- Verified at: 4316b7e76
- Source: [0261](../adr/0261-navigation-by-explorer-maps-and-a-mob-radar.md), [0090](../adr/0090-group-the-vehicle-core-by-subcontext.md)

## Rules

### Rider access and selection

- Applies to: Using the Nav item in the air or pressing the vehicle the player is riding.
- Rule: A player not riding the vehicle receives the translated riding-only message. A rider must be in the Overworld to open the destination form. A second press by the same player is ignored while their selection is pending. Cancel gives no item. After a choice, the player must still be a rider of the same vehicle before a map can be delivered.
- Agreement: Proposed
- Basis: [0261](../adr/0261-navigation-by-explorer-maps-and-a-mob-radar.md) Decision.
- Implementation: `src/infrastructure/vehicle/bedrock/handlers/navSwitch.ts`, `src/application/vehicle/openNav.ts`, `src/infrastructure/vehicle/bedrock/bedrockNavWorld.ts`.
- Verification: `tests/application/vehicle/openNav.test.ts` checks rider access, the order, cancellation, rider recheck, and repeated presses. `tests/infrastructure/vehicle/bedrock/subscriptions.test.ts` checks air and vehicle press routing. The `suv_nav_passenger_allowed` scenario checks that a passenger opens the menu with two seated probes.

### Nav guidance

- Applies to: Drivers and passengers who select the Nav in the hotbar or tap a block or entity while holding it.
- Rule: The action bar shows long-press instructions for touch, right-click instructions for mouse, or neutral use instructions for other controls. Selecting the Nav can always show guidance. A tap can show guidance only after 40 ticks have elapsed since the player's last guide. Both triggers stay silent while that player's Nav selection is pending. A touch tap in the air emits no script event.
- Agreement: Proposed
- Basis: [0261](../adr/0261-navigation-by-explorer-maps-and-a-mob-radar.md) Decision, the Nav item and destination menu. The [Nav hints design](../superpowers/specs/2026-11-26-nav-hints-design.md) specifies the guidance.
- Implementation: `src/domain/vehicle/navigation/navGuide.ts`, `src/domain/vehicle/spec.ts`, `src/application/vehicle/guideNav.ts`, `src/infrastructure/vehicle/bedrock/handlers/navGuide.ts`.
- Verification: `tests/domain/vehicle/navigation/navGuide.test.ts` checks timing and player independence. `tests/application/vehicle/guideNav.test.ts` checks rider eligibility, pending selections, and control wording. `tests/infrastructure/vehicle/bedrock/subscriptions.test.ts` checks event routing. Device checks are in [Manual test](../manual-test.md#nav-explorer-maps).

### Menu and map delivery

- Applies to: The destinations offered to an eligible rider.
- Rule: Each confirmed destination has a localized menu label and one loot table at `loot_tables/yasu_ride/nav_<destination>.json`. The form opens with these destinations in order: `buriedtreasure`, `mansion`, `monument`, `village`, `jungle_temple`, `swamp_hut`, `trial_chambers`, `pillager_outpost`, `shipwreck`, and `ruins`. After a rider chooses a destination, the action bar shows “Creating a map to %s...” with the translated destination name. The search starts two ticks later so the client can display the message first. Further presses are ignored during the wait. If the player is no longer riding the same vehicle at the end of the wait, delivery stops silently. The command adapter has inventory and feet-drop paths. The adapter verifies inventory delivery by comparing the total number of filled maps before and after the loot command, while a feet-drop for a full inventory leaves delivery unverified.
- Agreement: Proposed
- Basis: [0261](../adr/0261-navigation-by-explorer-maps-and-a-mob-radar.md) Decision and Consequences.
- Implementation: `src/domain/vehicle/navigation/destinations.ts`, `src/infrastructure/vehicle/bedrock/bedrockNavWorld.ts`, `src/infrastructure/shared/choiceForm.ts`.
- Verification: `tests/packs/nav.test.ts` checks that the shipped tables match the destination list and that both locales include the labels and creating message. `tests/application/vehicle/openNav.test.ts` checks the message and delay before delivery, dismounting and repeated presses during the wait, and cancellation. `tests/infrastructure/vehicle/bedrock/bedrockNavWorld.test.ts` checks the translated destination in the action-bar message, form answers, and both command paths with test data. The `nav_map_delivery` scenario checks inventory delivery for three sampled destinations. On flat terrain it returned `given` for `village`, `monument`, and `buriedtreasure`. The `nav_map_full_inventory` scenario checks that a full inventory selects the spawn path and reports delivery as unknown. Both scenarios require a connected player, so CI skips them. Player-origin and rendering checks are in [Manual test](../manual-test.md#nav-explorer-maps). Here, `given` confirms only that the player's filled-map count rose by exactly one after the explorer-map loot table ran.

### Radar scanning and clustering

- Applies to: Vehicles with at least one rider.
- Rule: Every 20 ticks, after the vehicle hints interval, the radar takes the next occupied vehicle in repository order. It queries loaded mobs within 128 blocks of the vehicle in its current dimension, once per mob type. A missing vehicle position skips the scan. A failed query contributes no hits. Villagers and iron golems indicate villages, pillagers indicate outposts, guardians and elder guardians indicate ocean monuments, vindicators and evokers indicate woodland mansions, and witches indicate witch huts. The radar infers places from mobs, so mobs elsewhere can trigger reports. Same-type hits linked by horizontal gaps of at most 48 blocks form a cluster whose center is the mean position of its hits.
- Agreement: Accepted
- Basis: [0090](../adr/0090-group-the-vehicle-core-by-subcontext.md) Decision, the `navigation/` subfolder for the kind-neutral radar.
- Implementation: `src/domain/vehicle/navigation/radarTargets.ts`, `src/domain/vehicle/navigation/radar.ts`, `src/domain/vehicle/spec.ts`, `src/application/vehicle/scanForPlaces.ts`, `src/infrastructure/vehicle/bedrock/bedrockRadarWorld.ts`, `src/infrastructure/vehicle/bedrock/handlers/drive.ts`. The development hook in `src/infrastructure/vehicle/testHooks/testRadar.ts` forwards the synthetic rider's reports to `src/test-pack/scenarios/radar.ts`.
- Verification: Property tests in `tests/domain/vehicle/navigation/radar.test.ts` cover clustering. Application and adapter tests cover scan rotation, missing positions, and per-type queries. `tests/infrastructure/vehicle/bedrock/subscriptions.test.ts` checks interval order. The BDS scenarios `suv_radar_village` and `sportsboat_radar_monument` summon mobs and check the place and direction reported to a test driver. The `suv_radar_passenger` scenario checks the report with only a passenger aboard.

### Radar reports and ride memory

- Applies to: The action bar of each rider with pending places.
- Rule: A cluster is already known if its center lies within 48 horizontal blocks of a pending or reported center of the same type in the same dimension. Each rider keeps their own radar memory for each dimension. When a rider gets out, only that rider's memory is cleared. When the vehicle leaves the repository, all its riders' memories for that vehicle are cleared. On each radar interval, each rider whose action bar has had no write through the vehicle's shared log for at least 60 ticks can receive one report. The radar selects the nearest pending center within 128 horizontal blocks of the vehicle's current position, leaving farther centers pending. It reports one of eight 45-degree compass sectors and the horizontal distance rounded to the nearest ten meters. Both supported locales format the report as direction, distance, and place, for example "NE 120 m: Village" in English.
- Agreement: Accepted
- Basis: [0090](../adr/0090-group-the-vehicle-core-by-subcontext.md) Decision, the `navigation/` subfolder for the kind-neutral radar.
- Implementation: `src/domain/vehicle/navigation/compass.ts`, `src/domain/vehicle/navigation/radar.ts`, `src/application/vehicle/scanForPlaces.ts`, `src/infrastructure/vehicle/bedrock/actionBarLog.ts`, `src/infrastructure/vehicle/bedrock/bedrockRadarWorld.ts`, `packs/yasu_ride_rp/texts/en_US.lang`, `packs/yasu_ride_rp/texts/ja_JP.lang`.
- Verification: Domain properties check compass sectors, distance rounding, center drift, reporting once, re-measurement, and retention outside the radius. Application tests cover independent quiet timing, rider departures, vehicle removal, and dimension changes. Adapter and pack tests cover raw message arguments and the locale keys. The BDS scenario `suv_radar_quiet` writes a vehicle message before summoning villagers and checks the tick of the first report. All four radar scenarios continue listening for duplicates.

## Open issues

- A player who boards while already holding the Nav sees guidance only after switching away and back to the Nav or tapping a block or entity.
- ADR 0261 calls for maps to the nearest unexplored destination. The [corrected spike record](../superpowers/specs/2026-11-25-driving-navigation-design.md#spike-results) confirms ten filled maps and a player-origin give path in natural terrain. The menu offers all ten destinations. The cost of a successful distant search still needs measurement. Human checks remain for full-inventory delivery and menu cancellation on natural terrain, the first-person off-hand map while riding on PC and iPad, and the Locator Bar with a second player online.
- ADR 0261 calls for discarding out-of-range radar reports. The implementation retains them as pending in `src/domain/vehicle/navigation/radar.ts`. The ADR needs an edit or a superseding ADR.
- Client rendering of the translated radar report still needs an in-game check.
