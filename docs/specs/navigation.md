# Driving navigation

- Scope: The automatic radar for places indicated by nearby mobs while driving any vehicle kind.
- Verified at: 88df5456d
- Source: [0090](../adr/0090-group-the-vehicle-core-by-subcontext.md)

## Rules

### Scanning and clustering

- Applies to: Vehicles with a current driver.
- Rule: Every 20 ticks, after the vehicle hints interval, the radar takes the next driven vehicle in repository order. It queries loaded mobs within 128 blocks of the vehicle in its current dimension, once per mob type. A missing vehicle position skips the scan. A failed query contributes no hits. Villagers and iron golems indicate villages, pillagers indicate outposts, guardians and elder guardians indicate ocean monuments, vindicators and evokers indicate woodland mansions, and witches indicate witch huts. The radar infers places from mobs, so mobs elsewhere can trigger reports. Same-type hits linked by horizontal gaps of at most 48 blocks form a cluster whose center is the mean position of its hits.
- Agreement: Accepted
- Basis: [0090](../adr/0090-group-the-vehicle-core-by-subcontext.md) Decision, the `navigation/` subfolder for the kind-neutral radar.
- Implementation: `src/domain/vehicle/navigation/radarTargets.ts`, `src/domain/vehicle/navigation/radar.ts`, `src/domain/vehicle/spec.ts`, `src/application/vehicle/scanForPlaces.ts`, `src/infrastructure/vehicle/bedrock/bedrockRadarWorld.ts`, `src/infrastructure/vehicle/bedrock/handlers/drive.ts`. The development hook in `src/infrastructure/vehicle/testHooks/testRadar.ts` forwards the synthetic driver's reports to `src/test-pack/scenarios/radar.ts`.
- Verification: Property tests in `tests/domain/vehicle/navigation/radar.test.ts` cover clustering. Application and adapter tests cover scan rotation, missing positions, and per-type queries. `tests/infrastructure/vehicle/bedrock/subscriptions.test.ts` checks interval order. The BDS scenarios `suv_radar_village` and `sportsboat_radar_monument` summon mobs and check the place and direction reported to a test driver.

### Reports and drive memory

- Applies to: The action bar of each driver with pending places.
- Rule: A cluster is already known if its center lies within 48 horizontal blocks of a pending or reported center of the same type in the same dimension. Radar memory belongs to the current driver of each vehicle and is cleared when the vehicle leaves the repository or its driver changes or gets out. On each radar interval, a driver whose action bar has had no write through the vehicle's shared log for at least 60 ticks can receive one report. The radar selects the nearest pending center within 128 horizontal blocks of the vehicle's current position, leaving farther centers pending. It reports one of eight 45-degree compass sectors and the horizontal distance rounded to the nearest ten meters. Both supported locales format the report as direction, distance, and place, for example "NE 120 m: Village" in English.
- Agreement: Accepted
- Basis: [0090](../adr/0090-group-the-vehicle-core-by-subcontext.md) Decision, the `navigation/` subfolder for the kind-neutral radar.
- Implementation: `src/domain/vehicle/navigation/compass.ts`, `src/domain/vehicle/navigation/radar.ts`, `src/application/vehicle/scanForPlaces.ts`, `src/infrastructure/vehicle/bedrock/actionBarLog.ts`, `src/infrastructure/vehicle/bedrock/bedrockRadarWorld.ts`, `packs/yasu_ride_rp/texts/en_US.lang`, `packs/yasu_ride_rp/texts/ja_JP.lang`.
- Verification: Domain properties check compass sectors, distance rounding, center drift, reporting once, re-measurement, and retention outside the radius. Application tests cover quiet timing, driver changes, removal, and dimension changes. Adapter and pack tests cover raw message arguments and the locale keys. The BDS scenario `suv_radar_quiet` writes a vehicle message before summoning villagers and checks the tick of the first report. All three scenarios continue listening for duplicates.

## Open issues

- Client rendering of the translated radar report still needs an in-game check.
