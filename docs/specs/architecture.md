# Architecture and layering

- Scope: Stable Script APIs, layer and feature boundaries, shared primitives, vehicle core and kind contracts, command delivery, and pack identifiers and layout.
- Verified at: 7267bd8a
- Source: [0001](../adr/0001-bedrock-addon-with-stable-script-api.md)
- Source: [0012](../adr/0012-ddd-layered-architecture.md)
- Source: [0046](../adr/0046-organize-each-layer-by-feature.md)
- Source: [0047](../adr/0047-rename-to-yasuflatland-ride.md)
- Source: [0050](../adr/0050-vehicle-kinds-and-per-kind-profiles.md)
- Source: [0055](../adr/0055-kind-neutral-vehicle-core.md)
- Source: [0065](../adr/0065-check-import-rules-with-dependency-cruiser.md)
- Source: [0072](../adr/0072-keep-motion-behind-the-kinds.md)
- Source: [0083](../adr/0083-ram-targets-are-a-core-sensor.md)
- Source: [0087](../adr/0087-sports-boat-spec-table.md)
- Source: [0089](../adr/0089-per-kind-control-mapping.md)
- Source: [0090](../adr/0090-group-the-vehicle-core-by-subcontext.md)
- Source: [0127](../adr/0127-resend-every-synced-entity-value-after-a-failed-send.md)
- Source: [0129](../adr/0129-share-room-primitives-between-features.md)
- Source: [0156](../adr/0156-resend-the-docked-property-after-a-failed-send.md)
- Source: [0178](../adr/0178-bulldozer-build-tools-in-a-separate-namespace.md)
- Source: [0198](../adr/0198-one-build-wand-without-a-bulldozer.md)
- Source: [0200](../adr/0200-roof-tent-as-a-host-bound-camp-entity.md)
- Source: [0217](../adr/0217-derive-the-suv-spec-from-the-rubicon-body.md)
- Source: [0220](../adr/0220-separate-room-capability-from-drive.md)
- Source: [0221](../adr/0221-organize-infrastructure-vehicle-code-by-kind.md)
- Source: [0222](../adr/0222-split-the-drive-world-port-by-role.md)
- Excluded: [0179](../adr/0179-support-realms-as-a-second-play-environment.md): Realms support belongs to the dev-environment topic.
- Excluded: [0204](../adr/0204-shard-unit-tests-across-ci-jobs.md): CI sharding belongs to the testing topic, not runtime layering.
- Excluded: [0207](../adr/0207-lay-a-rain-ceiling-over-an-occupied-roof-tent.md): temporary occupied roof tent rain ceilings belong to the camping gear topic.

- Excluded: [0232](../adr/0232-undo-skips-conflicting-cells.md): conditional build Undo belongs to the build tools spec.

## Rules

### Stable APIs and script bundles

- Applies to: Main Behavior Pack and the separate in-game test pack.
- Rule: The packages in `package.json` are pinned stable releases of `@minecraft/server`, `@minecraft/server-ui`, and the data package `@minecraft/vanilla-data`; the manifests declare stable server module dependencies, with server-ui also declared by the main pack. Build forms import server-ui in build infrastructure. Source imports and manifests contain no beta module, experimental dependency, or `@minecraft/server-gametest`. `scripts/build.mjs` uses esbuild to bundle TypeScript from `src/main.ts` into `packs/yasu_ride_bp/scripts/main.js` and from `src/test-pack/runner.ts` into `packs/yasu_ride_test_bp/scripts/main.js`, leaving the server and server-ui modules external.
- Agreement: Proposed
- Basis: [0001](../adr/0001-bedrock-addon-with-stable-script-api.md) Decision, "Do not use beta APIs or experimental features"; [0001](../adr/0001-bedrock-addon-with-stable-script-api.md) Decision, "Write scripts in TypeScript, bundle them into a single file with esbuild, and ship it in the Behavior Pack"; [0198](../adr/0198-one-build-wand-without-a-bulldozer.md) Decision, "Keep stable Script APIs, the existing layer and feature boundaries, and the `@minecraft/server-ui` 2.0.0 dependency."
- Implementation: `package.json`; `scripts/build.mjs`; `packs/yasu_ride_bp/manifest.json`; `packs/yasu_ride_test_bp/manifest.json`; `src/infrastructure/build/bedrock/buildMenus.ts`
- Verification: Not verified: no identified test checks this complete dependency, stable API, experiment, GameTest exclusion, or bundle contract. Checked by reading the package, manifests, build script and source imports; no build or runtime check was run.

### Layer direction and entry point

- Applies to: `src/domain/`, `src/application/`, `src/infrastructure/`, and `src/main.ts`.
- Rule: Domain contains game-independent rules and contracts; application coordinates use cases through ports; infrastructure implements those ports, subscribes to engine events, and wires objects. Domain imports neither application, infrastructure nor `@minecraft/*`, and application imports neither infrastructure nor `@minecraft/*`; infrastructure may import application and domain. `src/main.ts` imports bootstrap and only calls `bootstrap()`. `src/test-pack/` runs separately and is outside the layers.
- Agreement: Accepted
- Basis: [0012](../adr/0012-ddd-layered-architecture.md) Decision, "Dependencies point one way only: infrastructure → application → domain."; [0012](../adr/0012-ddd-layered-architecture.md) Decision, "The entry point `src/main.ts` only calls `bootstrap()`"; [0012](../adr/0012-ddd-layered-architecture.md) Decision, "so it sits outside these three layers"
- Implementation: `.dependency-cruiser.cjs` (`domain-imports-outer-layer`, `application-imports-infrastructure`, `main-imports-only-bootstrap`); `src/main.ts`; `src/test-pack/runner.ts`
- Verification: `tests/architecture.test.ts` uses `it.each` title "%s", including "domain importing application", "domain importing infrastructure", "application importing infrastructure", "main importing bootstrap", "main importing past bootstrap", and "test pack excluded". Not verified: these fixtures do not check actual engine-package imports or that main contains only a call; the real import graph is checked by the separate dependency-cruiser command, which was not run.

### Vehicle drive world roles

- Applies to: `src/application/vehicle/ports/drive.ts`, `src/application/vehicle/riderEffects.ts`, and `src/infrastructure/vehicle/bedrock/bedrockVehicleWorld.ts`.
- Rule: `DriveWorld` is the intersection of loaded vehicle, surroundings, impulse, vehicle block, rider and rider effect roles. `DriveVehicles` consumes the intersection; `RiderEffects` consumes only `RiderEffectWorld`. `BedrockVehicleWorld` delegates to six role classes and a vehicle space class, sharing one set of stateful managers and preserving its constructor, public methods and releaser. Each role implementation file is below 300 lines.
- Agreement: Accepted
- Basis: [0222](../adr/0222-split-the-drive-world-port-by-role.md) Decision
- Implementation: `src/application/vehicle/ports/drive.ts`; `src/application/vehicle/riderEffects.ts`; `src/infrastructure/vehicle/bedrock/bedrockVehicleWorld.ts`; `src/infrastructure/vehicle/bedrock/bedrockLoadedVehicles.ts`; `src/infrastructure/vehicle/bedrock/bedrockSurroundings.ts`; `src/infrastructure/vehicle/bedrock/bedrockVehicleImpulse.ts`; `src/infrastructure/vehicle/bedrock/bedrockVehicleBlocks.ts`; `src/infrastructure/vehicle/bedrock/bedrockVehicleRiders.ts`; `src/infrastructure/vehicle/bedrock/bedrockRiderEffects.ts`; `src/infrastructure/vehicle/bedrock/bedrockVehicleSpace.ts`
- Verification: `tests/infrastructure/vehicle/bedrock/bedrockVehicleWorld.test.ts` exercises snapshots, movement, blocks, riders, effects, cleanup and space through the composing adapter. Role signatures are checked by `pnpm typecheck`; file sizes are checked manually with `wc -l`.

### Import checker and its self-test

- Applies to: Dependency-cruiser configuration and architecture fixtures.
- Rule: `package.json` pins dependency-cruiser and `@swc/core` and runs the configuration through `lint:deps`. The configuration selects the swc parser, counts type-only imports with `tsPreCompilationDeps: true`, uses the repository tsconfig, does not follow node_modules, excludes `src/test-pack/`, and rejects unresolved imports with `not-resolvable`. The fixture helper uses a realpath temporary directory, clears the repository tsConfig option, and passes `validate: true` with the same forbidden rules.
- Agreement: Accepted
- Basis: [0065](../adr/0065-check-import-rules-with-dependency-cruiser.md) Decision, "Count type-only imports with `tsPreCompilationDeps: true` and exclude `src/test-pack/`, which sits outside the layers."; [0065](../adr/0065-check-import-rules-with-dependency-cruiser.md) Decision, "Add an unresolved-import rule so missing targets cannot evade the boundary checks."
- Implementation: `package.json`; `.dependency-cruiser.cjs`; `tests/architecture.test.ts`
- Verification: `tests/architecture.test.ts` `it.each` title "%s" exercises the named forbidden rules, including "unresolvable import", "kind names importing a type", and "test pack excluded". Not verified: current parser execution, exit status, or the ADR's expected `missing-typescript-transpiler` warning; no dependency check was run.

### Feature folders and isolation

- Applies to: All production layers and their tests.
- Rule: Domain, application and infrastructure each contain the features `build`, `camp`, and `vehicle`, alongside `shared`. Layer TypeScript files live below those folders except `src/infrastructure/bootstrap.ts`. A feature imports only itself and shared code across the layers; shared code imports no feature. Tests use matching layer and feature directories, with main, test-pack, pack and support tests outside that arrangement.
- Agreement: Accepted
- Basis: [0046](../adr/0046-organize-each-layer-by-feature.md) Decision, "Every TypeScript file in each layer lives under a feature folder or `shared/`, except `src/infrastructure/bootstrap.ts`."; [0046](../adr/0046-organize-each-layer-by-feature.md) Decision, "A feature must not import another feature in any layer. Shared code must not import a feature."; [0046](../adr/0046-organize-each-layer-by-feature.md) Decision, "Tests mirror the feature layout."
- Implementation: `src/domain`; `src/application`; `src/infrastructure`; `tests/domain`; `tests/application`; `tests/infrastructure`; `.dependency-cruiser.cjs` (`feature-imports-other-feature`)
- Verification: `tests/architecture.test.ts` "finds the vehicle feature folder" and the template title "${layer} keeps files in shared or feature folders"; `it.each` title "%s", cases "other feature across layers", "shared into a feature across layers", and "feature into shared". Not verified: exact feature membership and complete test-to-source layout correspondence are read from the tree, not asserted by those tests.

### Composition root and feature callbacks

- Applies to: Feature installation and cross-feature coordination.
- Rule: Each feature exposes an infrastructure install function that constructs adapters, repositories and use cases and registers subscriptions. Bootstrap calls `installVehicles`, then `installCamp`, then `installBuild`; vehicles receive a late-bound camp space check, camp receives the vehicle space check, and build receives their logical union as its protected-space check. Camp switch targets also reach vehicles through a late-bound callback; the camera-wish callback currently answers false. Features exchange these callbacks through bootstrap instead of importing one another.
- Agreement: Proposed
- Basis: [0046](../adr/0046-organize-each-layer-by-feature.md) Decision, "Each feature exposes an infrastructure install function."; [0129](../adr/0129-share-room-primitives-between-features.md) Decision, "Features see each other's space only as a `SpaceCheck` passed through `bootstrap.ts`, in both directions."; [0178](../adr/0178-bulldozer-build-tools-in-a-separate-namespace.md) Decision, "Add a feature `build` that holds the selection and edit tools, inside this add-on until it is split into its own add-on."
- Implementation: `src/infrastructure/bootstrap.ts`; `src/infrastructure/vehicle/install.ts`; `src/infrastructure/camp/install.ts`; `src/infrastructure/build/install.ts`
- Verification: `tests/infrastructure/bootstrap.test.ts` "wires space both ways through a late-bound camp reference (ADR 0129)", "hands the vehicles the camp's switch targets once camp is installed", and "installs build last and passes both space checks without requesting a camera change". Not verified: all installed subscriptions operating together in game; tests were read, not run.

### Shared primitives and feature-owned policies

- Applies to: Shared modules and the vehicle and camp room-block adapters.
- Rule: Domain shared primitives include `cells.ts`, `laidCells.ts` (`relayCells`), `sleep.ts`, `paint.ts`, `switchCooldown.ts`, `tapToggle.ts`, and `syncedValue.ts`; application shared contains `sleepInBed.ts`, `repaint.ts`, and `ports/`. Infrastructure shared contains `identifiers.ts` (`AIR_BLOCK`, `messageKey`, `HEADLIGHT_SWITCH_TYPE`), `lightBlocks.ts`, `laidCells.ts` (`CellLayer`), `laidBlockGuard.ts`, `bedrockBedWorld.ts`, `dyes.ts` (`PAINT_VARIANT`, `paintEvent`), and `switchRouter.ts`; all these paths exist. `DockBlocks` and `createTentBlocks` construct separate `CellLayer` instances, while each feature retains its own block union, IDs, saved keys and policies such as camper door behavior and `PaintVehicle`. Dock laying rejects new camp cells but keeps cells it already owns, including saved cells recovered after reload.
- Agreement: Accepted
- Basis: [0129](../adr/0129-share-room-primitives-between-features.md) Decision, "`shared/` holds kind-neutral primitives and parameterized engines only."; [0129](../adr/0129-share-room-primitives-between-features.md) Decision, "Each feature keeps its own owner registry, a `CellLayer` instance per feature"; [0129](../adr/0129-share-room-primitives-between-features.md) Decision, "Room laying keeps cells the vehicle already owns if a later camp answer claims them."
- Implementation: `src/domain/shared`; `src/application/shared`; `src/infrastructure/shared`; `src/infrastructure/vehicle/kinds/camper/dockBlocks.ts`; `src/infrastructure/camp/bedrock/tentBlocks.ts`; `src/application/vehicle/paintVehicle.ts`
- Verification: `tests/infrastructure/shared/laidCells.test.ts` "reports held keys from the save before the first lay, then from the laid cells in the holder's dimension only" checks saved ownership in the primitive. Not verified: that test does not establish separate feature registries, complete module placement, or the dock's camp-filter policy; those are checked here by reading code only.

### Saved paint order

- Applies to: Painted vehicles and tents.
- Rule: `PAINTS` is the persisted variant order, and infrastructure derives `PAINT_VARIANT` and namespaced paint events from it. Paint events and render controllers use the same indices, including the tent. The complete order is pinned by a test.
- Agreement: Accepted
- Basis: [0129](../adr/0129-share-room-primitives-between-features.md) Decision, "`PAINTS` order is the saved `minecraft:variant` of every painted entity, the tent included, so its order never changes."
- Implementation: `src/domain/shared/paint.ts`; `src/infrastructure/shared/dyes.ts`; `packs/yasu_ride_bp/entities/yasu_ride`; `packs/yasu_ride_rp/render_controllers/yasu_ride`
- Verification: `tests/domain/shared/paint.test.ts` "preserves the saved variant order"; `tests/packs/paint.test.ts` "each paint event sets that paint's variant and drops the other paints" (SUV and tent describes). Not verified: loading a previously painted world in game.

### Vehicle core, motion and kinds

- Applies to: Vehicle domain and outer-layer imports of it.
- Rule: `src/domain/vehicle/` outside `kinds/` and `motion/` is the core; movement building blocks live in `motion/`, and kind-specific drives, profiles, tuning and entity contracts live in `kinds/<kind>/`. `VEHICLE_KINDS` declares `suv`, `sportsboat`, `camper`, and `bulldozer`, and `kind.ts` imports nothing. Kinds never import another kind or the registry; core and motion never import kinds, and core never imports motion. Application and infrastructure have no per-kind folders and import kinds only through `kinds/index.ts`; they cannot import motion directly, though the kinds index may re-export motion values.
- Agreement: Accepted
- Basis: [0055](../adr/0055-kind-neutral-vehicle-core.md) Decision, "`kind.ts` holds the kind names and `isVehicleKind` guard and imports nothing"; [0055](../adr/0055-kind-neutral-vehicle-core.md) Decision, "The application and infrastructure layers get no per-kind folders."; [0072](../adr/0072-keep-motion-behind-the-kinds.md) Decision, "no module under `src/application/` or `src/infrastructure/` may import a module under `src/domain/vehicle/motion/`."
- Implementation: `src/domain/vehicle`; `src/domain/vehicle/kind.ts`; `src/domain/vehicle/kinds/index.ts`; `.dependency-cruiser.cjs` (`kind-imports-other-kind`, `core-imports-kind`, `core-imports-motion`, `outer-layer-imports-kind`, `outer-layer-imports-motion`, `kind-names-import-nothing`)
- Verification: `tests/architecture.test.ts` `it.each` title "%s", cases "other kind", "kind importing the registry", "core importing kind", "motion importing kind", "core subfolder importing motion", "application kind", "infrastructure kind", "application motion", "infrastructure motion", "kinds index importing motion", and "kind names importing a built-in package". Not verified: absence of per-kind outer-layer folders has no dedicated assertion; it was checked from paths.

### Core subcontexts

- Applies to: Vehicle core organization and corresponding domain tests.
- Rule: The vehicle directory contains `dock/`, `fleet/`, `lighting/`, `monitor/`, `placement/`, `kinds/`, and `motion/`. Core subcontexts import each other and flat core files directly, with no barrel `index.ts` in dock, fleet, lighting, monitor or placement. Flat core files are `cooldowns.ts`, `crew.ts`, `cut.ts`, `cutArea.ts`, `drive.ts`, `driveInput.ts`, `entityContract.ts`, `hints.ts`, `kind.ts`, `pave.ts`, `profile.ts`, `ram.ts`, `ramQuery.ts`, `seatChoice.ts`, `seating.ts`, `seats.ts`, `spec.ts`, `standIn.ts`, `vehicle.ts`, and `vehicleRepository.ts`. Domain tests use matching subcontext directories for the moved modules that have tests.
- Agreement: Accepted
- Basis: [0090](../adr/0090-group-the-vehicle-core-by-subcontext.md) Decision, "Subfolders of the core may import each other and the flat core files."; [0090](../adr/0090-group-the-vehicle-core-by-subcontext.md) Decision, "No barrel `index.ts` in the new subfolders; importers name the file"; [0090](../adr/0090-group-the-vehicle-core-by-subcontext.md) Decision, "`tests/` mirrors the moves"
- Implementation: `src/domain/vehicle`; `tests/domain/vehicle`; `.dependency-cruiser.cjs`
- Verification: `tests/architecture.test.ts` `it.each` title "%s", cases "core subfolder importing another subfolder" and "core subfolder importing the flat core" check permitted imports. Not verified: exact folder and flat-file membership, absence of barrels, and test placement are not asserted by a dedicated layout test.

### Registry and explicit construction

- Applies to: Creating or rebuilding any vehicle kind.
- Rule: `KINDS` is frozen, including its rows, and maps each kind to its profile, entity contract and drive factory. `createVehicle` and `rebuildVehicle` require a kind and select the corresponding profile and drive; `Vehicle` requires `(id, profile, drive)` without an SUV default. Rebuilding restores riders and reads saved kind properties only when the aggregate is missing.
- Agreement: Accepted
- Basis: [0055](../adr/0055-kind-neutral-vehicle-core.md) Decision, "`kinds/index.ts` maps each kind to its profile, entity contract, and drive factory in the frozen `KINDS` record, and exports `createVehicle` and `rebuildVehicle`."; [0055](../adr/0055-kind-neutral-vehicle-core.md) Decision, "`Vehicle` takes `(id, profile, drive)` with no defaults."
- Implementation: `src/domain/vehicle/kinds/index.ts`; `src/domain/vehicle/vehicle.ts`; `src/application/vehicle/driveVehicles.ts`
- Verification: `tests/domain/vehicle/profile.test.ts` "freezes every profile and motion limit so a write cannot change all vehicles of a kind" and "recognizes exactly the registered kinds and preserves kind when creating or rebuilding"; `tests/application/vehicle/driveVehicles.test.ts` "reads restored properties only when an aggregate is missing". Not verified: those runtime tests do not prove every caller supplies arguments; the signatures were read without running typecheck.

### Tuning and the core profile

- Applies to: Core constants, movement building blocks and per-kind values.
- Rule: Core tuning lives in `SPEC`, shared motion tuning in `MOTION` in `motion/constants.ts`, and kind tuning in `SUV_SPEC`, `CAMPER_SPEC`, `SPORTSBOAT_SPEC`, and `BULLDOZER_SPEC` in their respective `kinds/<kind>/spec.ts`. Each kind builds its own motion limits and profile without borrowing SUV defaults. `VehicleProfile` holds core-consumed data: kind, fleet limit, body and optional ram-width cap, footprint, seats and boarding, exits and parked-seat behavior, beams, placement, chase camera, default paint, hints, stand-in, placement gift and monitor. SUV roof-tent tuning places the tent center at vehicle-local `(1.165811, -1.077015)` (x points left). The tent owns its 1.968-block shell half width; its right platform edge aligns with the conservative CAB-based hardtop edge at -0.802189 blocks and the left side overhangs. The ladder entrance is `(3.621311, -1.452015)`, clear of the 1.43-block body half width. The camper keeps anchor `(0, -0.875)`, no tent ladder, and entrance `(-1.0625, -3.7)` at its existing ladder. The sports boat derives its motion, body, drag, attitude and deck values from its import-free frozen spec; its water medium remains beside the drive's drag estimator, and it has no handbrake grip in its spec or motion limits.
- Agreement: Accepted
- Basis: [0055](../adr/0055-kind-neutral-vehicle-core.md) Decision, "Each tuning value still lives in one place (0002): `SPEC` for values the core reads, `MOTION` in `motion/constants.ts` for the motion functions, and `SUV_SPEC` in `kinds/suv/spec.ts` for SUV tuning."; [0055](../adr/0055-kind-neutral-vehicle-core.md) Decision, "`VehicleProfile` keeps only what the core reads"; [0087](../adr/0087-sports-boat-spec-table.md) Decision, "It is frozen and imports nothing"; [0089](../adr/0089-per-kind-control-mapping.md) Decision, "The sports boat has no `handbrakeGrip`."
- Basis: [0217](../adr/0217-derive-the-suv-spec-from-the-rubicon-body.md) Decision, "Keep every SUV gameplay value in `SUV_SPEC`; other kinds retain their own dimensions."
- Implementation: `src/domain/vehicle/spec.ts`; `src/domain/vehicle/motion/constants.ts`; `src/domain/vehicle/profile.ts`; `src/domain/vehicle/kinds`
- Verification: `tests/domain/vehicle/kinds/sportsboat/spec.test.ts` "freezes the table and every object derived from it", "reads every motion limit from the spec", and "reads the ram reach, water drag, attitude and deck from the spec"; `tests/domain/vehicle/profile.test.ts` "builds the SUV profile from the existing tuning and seat data", "keeps the SUV ladder foot at least 0.9 block outside its body and the anchor inside", and "preserves the camper roof tent mount and existing ladder entrance". Not verified: no identified test proves every tuning value is defined once or that every profile field has a core reader.

### Drive and sensor contracts

- Applies to: `Vehicle.tick`, `Drive.step`, and application vehicle snapshots.
- Rule: A drive owns motion state and exposes `speed`, `yaw`, `resync`, mount and seat-vacated hooks, and `step(raw, ctx)` returning impulse, forward, commands and rider effects, with optional docking, clearing, cutting, paving, message, departure, deck-boarding and ram-width outputs. It can also implement optional seat-taken, ceiling-light and tool-state hooks. Room operations are required methods on the separate `RoomDrive` capability in `dock/roomDrive.ts`; `isRoomDrive` checks all nine methods, and `Vehicle.asRoom()` exposes the capability or undefined (0220). `TickContext` contains tick, optional held block, deck-seat inputs, location, velocity, onGround, lazy solid/water/optional lava/block-type queries, and optional awaitingDriver; ram targets remain solely on `VehicleTickInput`, queried only above `SPEC.ramMinSpeed`. `Vehicle.tick` removes riders, test input, test held item, deck riders and targets before passing sensors to the drive, and derives heldBlock, awaitingDriver and occupied-seat-filtered deck input. `VehicleSnapshot` contains kind, ID, location, yaw, velocity, onGround, riders, deck inputs and riders, a lazy `restored()` function, headlights and optional test input/held item.
- Agreement: Accepted
- Basis: [0055](../adr/0055-kind-neutral-vehicle-core.md) Decision, "The drive owns its motion state and limits."; [0083](../adr/0083-ram-targets-are-a-core-sensor.md) Decision, "`TickContext` no longer has `targets()`."; [0083](../adr/0083-ram-targets-are-a-core-sensor.md) Decision, "`Vehicle.tick` removes `riders`, `testInput`, and `targets` from its input before it calls `Drive.step`, and passes `targets` to the ram step itself"
- Implementation: `src/domain/vehicle/drive.ts`; `src/domain/vehicle/vehicle.ts`; `src/application/vehicle/ports/drive.ts`; `src/application/vehicle/driveVehicles.ts`
- Verification: `tests/domain/vehicle/drive.test.ts` "keeps the ram target query out of the drive's sensors (ADR 0083)" is a type assertion; `tests/domain/vehicle/vehicle.test.ts` "queries nearby targets only while faster than ramMinSpeed (ADR 0006)"; `tests/application/vehicle/driveVehicles.test.ts` "forwards lazy block queries with the vehicle id and world cells". Not verified: complete interface membership and laziness of every sensor have no single exhaustive test; the interfaces were read.

### Engine commands and entity contracts

- Applies to: Domain command builders, pack definitions and `DriveWorld.run`.
- Rule: `EngineCommand` permits `setProperty`, `triggerEvent`, `playAnimation`, and `playSound`. Property, event and animation commands carry entity-local names; infrastructure expands them through `entityPropertyId`, `entityEventId`, and `entityAnimationId`, while sound commands retain full names and play at the vehicle location. Each kind declares property types and ranges or enum values, events, animations and restored properties; typed builders use those declared keys, and kind contracts cannot reserve core property names or paint event prefixes. Infrastructure processes commands in order and returns without acting when the entity is missing.
- Agreement: Accepted
- Basis: [0055](../adr/0055-kind-neutral-vehicle-core.md) Decision, "Commands are `setProperty`, `triggerEvent`, `playAnimation`, and `playSound` (at the vehicle)."; [0055](../adr/0055-kind-neutral-vehicle-core.md) Decision, "Commands are built by typed functions bound to the contract's keys"; [0055](../adr/0055-kind-neutral-vehicle-core.md) Decision, "A missing entity makes a command do nothing"
- Implementation: `src/domain/vehicle/drive.ts`; `src/domain/vehicle/entityContract.ts`; `src/domain/vehicle/kinds`; `src/infrastructure/vehicle/bedrock/identifiers.ts`; `src/infrastructure/vehicle/bedrock/bedrockVehicleWorld.ts`
- Verification: `tests/packs/entityContract.test.ts` `it.each` title "matches the %s entity contract to its packs and reserves core names" walks `VEHICLE_KINDS` through the registry; `tests/domain/vehicle/engineCommands.test.ts` `it.each` title "emits declared commands with valid values for %s over 200 random ticks"; `tests/domain/vehicle/entityContract.test.ts` "builds the commands a contract declares". Not verified: random ticks do not cover every optional interaction path or prove all sound names exist.

### Step and seat command order

- Applies to: Application processing of a vehicle tick.
- Rule: `DriveVehicles` sends `stepCommands` in its first world run, before holds, clearing, cutting, paving, movement, seating, laid cells, headlights and damage. It sends `finalCommands` later, with vacated-seat commands followed by taken-seat commands in ascending seat order; rider exits follow this run. A thrown operation skips the rest of that vehicle's tick while per-vehicle isolation lets other vehicles continue.
- Agreement: Accepted
- Basis: [0055](../adr/0055-kind-neutral-vehicle-core.md) Decision, "`DriveVehicles` runs the step's commands first, in order, and the seat commands last, through `DriveWorld.run(vehicleId, commands)`."; [0055](../adr/0055-kind-neutral-vehicle-core.md) Decision, "A throw skips the rest of that vehicle's tick"
- Implementation: `src/domain/vehicle/vehicle.ts`; `src/application/vehicle/driveVehicles.ts`; `src/application/vehicle/isolated.ts`
- Verification: `tests/domain/vehicle/vehicle.test.ts` "runs the taken seats' commands after the vacated seats' commands, ascending"; `tests/application/vehicle/driveVehicles.test.ts` "still writes a vehicle form change when moving the vehicle throws on that tick", "stands each leaving rider at their exit after the final commands", and "keeps moving the other vehicles and logs the error when one vehicle throws". Not verified: every possible failure position in every world operation.

### Placement contract

- Applies to: Placing a vehicle from its kind profile.
- Rule: `PlacementRule` is `{ surfaces, clearance }`; surfaces are tried in their declared order with no implicit top fallback. Supported surfaces are top, water and lava; top requires the up face, and liquid placement tries the clicked and adjacent cells and climbs the contiguous column within `SPEC.placementWaterClimb`. Clearance declares halfX, halfZ and height; kinds derive height through `clearanceHeight(body)`, which rounds up body height, while pack tests compare each clearance with its collision box.
- Agreement: Accepted
- Basis: [0055](../adr/0055-kind-neutral-vehicle-core.md) Decision, "`PlacementRule` becomes `{ surfaces, clearance }`"; [0055](../adr/0055-kind-neutral-vehicle-core.md) Decision, "in the order tried"
- Implementation: `src/domain/vehicle/placement/placement.ts`; `src/domain/vehicle/kinds`; `tests/packs/placementClearance.test.ts`
- Verification: `tests/domain/vehicle/placement/placement.test.ts` "tries surfaces in their declared order and has no implicit top fallback", "derives every kind's clearance height from its body", and "uses every dimension of a kind's clearance"; `tests/packs/placementClearance.test.ts` "fits every %s collision box inside its placement clearance". Not verified: placement on client devices or every liquid configuration in game.

### Synced values and failed sends

- Applies to: Vehicle entity-value latches and application command delivery.
- Rule: `SyncedValue.next` suppresses unchanged values after the first send; optional `{ value }` construction primes a known value, including undefined, and `resync()` makes the next call send again. `Drive.resync()` resets its synced values, and `Vehicle.resync()` delegates to it and resets the monitor latch; camper reset includes inherited transforming values and storage doors. The application catches failures from `Vehicle.tick` and its first world run together, resyncs the vehicle and rethrows the same error; later world operations are outside this catch. A successful next step resends current values in their command order, including gravity before form; one-shot sounds, animations and dock/undock events are not latched or retried.
- Agreement: Accepted
- Basis: [0127](../adr/0127-resend-every-synced-entity-value-after-a-failed-send.md) Decision, "`resync()` marks it unsent, so its next `next(value)` sends the current value regardless of the previous value."; [0127](../adr/0127-resend-every-synced-entity-value-after-a-failed-send.md) Decision, "Wrap `Vehicle.tick` and the first world `run` together."; [0127](../adr/0127-resend-every-synced-entity-value-after-a-failed-send.md) Decision, "Do not latch or retry one-shot commands"
- Implementation: `src/domain/shared/syncedValue.ts`; `src/domain/vehicle/vehicle.ts`; `src/domain/vehicle/motion/transformingDrive.ts`; `src/domain/vehicle/kinds`; `src/application/vehicle/driveVehicles.ts`
- Verification: `tests/domain/shared/syncedValue.test.ts` "resends after any generated resync and otherwise sends only changes" and "can start primed with any value, including undefined, and forget it"; `tests/application/vehicle/driveVehicles.test.ts` "resyncs after tick throws after building commands, preserving the thrown error", "does not resync when a later world call throws after step commands succeeded", and "retries gravity_on after a failed landing send and logs the failure once"; `tests/domain/vehicle/kinds/camper/drive.test.ts` "resync resends all room properties with current values while driving or parked". Not verified: real engine partial failures; these are latch and fake-world tests, not delivery acknowledgements.

### Docked property and held attitude resend

- Applies to: Sports boat and camper after resync.
- Rule: Each drive keeps its own resend flag and appends the current docked property on the next step after resync, unless that step's dock or departure commands already sent it. A drive that has never held sends no extra docked property. A held sports boat also resends its level trim and roll through their latches once; an ordinary held step sends no attitude, and dock/undock events remain one-shot.
- Agreement: Proposed
- Basis: [0156](../adr/0156-resend-the-docked-property-after-a-failed-send.md) Decision, "After `resync()`, the next step of a sports boat or camper drive appends the `docked` property with its current held state, once."; [0156](../adr/0156-resend-the-docked-property-after-a-failed-send.md) Decision, "The dock and undock events stay one-shot, as 0127 decided. Only the property is resent."
- Implementation: `src/domain/vehicle/kinds/sportsboat/drive.ts`; `src/domain/vehicle/kinds/camper/drive.ts`; `src/domain/vehicle/motion/dockEntity.ts`
- Verification: `tests/domain/vehicle/kinds/sportsboat/drive.test.ts` "resends the docked property once after a failed send while held or after departing, and never before the first hold" and "resends level trim and roll once after a failed send while a boat that had tilted is held"; `tests/application/vehicle/driveVehicles.test.ts` `it.each` title "keeps every entity property equal to the drive's last value once the world stops failing, for %s". Not verified: owner acceptance of Proposed 0156 or recovery from lost component-group events in game.

### Namespace, IDs and vehicle tables

- Applies to: Runtime identifiers and names declared in packs.
- Rule: `NAMESPACE` is `yasu_ride`, and infrastructure builds ride IDs with `id(name)`; test entities use `yasu_ride_test`. Ride IDs use snake case, geometry names follow `geometry.yasu_ride.<name>`, animations `animation.yasu_ride.<entity>.<name>`, controllers `controller.<kind>.yasu_ride.<entity>[.<name>]`, sounds `yasu_ride.<name>`, and item texture shortnames `yasu_ride_<name>` with atlas resource pack name `yasu_ride`. Vehicle adapters use `VEHICLE_FAMILY` (`yasu_ride_vehicle`) and the `ENTITY_TYPE` and `ITEM_TYPE` records, mapping each `VEHICLE_KINDS` name to its matching entity and `<kind>_item` ID. Build infrastructure has its own identifier helper for `yasu_build`, used for the Build Wand, build messages and group; the ride blade switch retains its ride ID.
- Agreement: Proposed
- Basis: [0047](../adr/0047-rename-to-yasuflatland-ride.md) Decision, "Use `yasu_ride` as the namespace"; [0050](../adr/0050-vehicle-kinds-and-per-kind-profiles.md) Decision, "Map kind to entity ID and item ID in one infrastructure table. Find vehicles by the family `yasu_ride_vehicle`"; [0178](../adr/0178-bulldozer-build-tools-in-a-separate-namespace.md) Decision, "Every ID the feature defines uses `yasu_build:`"
- Implementation: `src/infrastructure/shared/identifiers.ts`; `src/infrastructure/vehicle/bedrock/identifiers.ts`; `src/infrastructure/vehicle/bedrock/entityIndex.ts`; `src/infrastructure/build/identifiers.ts`; `packs/yasu_ride_bp`; `packs/yasu_ride_rp`; `packs/yasu_ride_test_bp`
- Verification: `tests/infrastructure/shared/identifiers.test.ts` "recovers bare snake_case names from add-on ids"; `tests/infrastructure/vehicle/bedrock/identifiers.test.ts` `it.each` title "round-trips the entity and item IDs of %s"; `tests/packs/layout.test.ts` "namespaces every definition identifier"; `tests/naming.test.ts` "limits the former namespace to historical documents and citations". Not verified: layout's namespace check does not enforce every dotted-name segment, sound name, texture shortname or snake-case spelling; these patterns were also inspected in assets.

### Pack content paths

- Applies to: `yasu_ride_bp`, `yasu_ride_rp`, and development-only `yasu_ride_test_bp`.
- Rule: Content files sit flat below `<type>/yasu_ride/`, or `<type>/yasu_build/` for build content inside the same shipped packs; test entities sit below `entities/yasu_ride_test/`. Entity, item, recipe, client entity, animation, animation controller, render controller, particle and geometry files use `.se.json`, `.item.json`, `.recipe.json`, `.ce.json`, `.anim.json`, `.ac.json`, `.rc.json`, `.particle.json`, and `.geo.json` respectively. Engine-fixed paths stay outside content namespace folders as enumerated by `ENGINE_FIXED_FILES` and the texts locale exception in the layout test. The maximum path length, counted from the pack folder, is `MAX_PATH_LENGTH` in that test.
- Agreement: Proposed
- Basis: [0047](../adr/0047-rename-to-yasuflatland-ride.md) Decision, "Keep content files flat under `<type>/yasu_ride/<file>` in both packs"; [0047](../adr/0047-rename-to-yasuflatland-ride.md) Decision, "Test entities use `entities/yasu_ride_test/`."; [0178](../adr/0178-bulldozer-build-tools-in-a-separate-namespace.md) Decision, "Pack files go under `<type>/yasu_build/` inside `yasu_ride_bp` and `yasu_ride_rp`."
- Implementation: `packs/yasu_ride_bp`; `packs/yasu_ride_rp`; `packs/yasu_ride_test_bp`; `tests/packs/layout.test.ts`
- Verification: `tests/packs/layout.test.ts` "keeps content files flat under the namespace folder" and "keeps every path within the console limit". Not verified: suffixes are conventions observed in paths, not assertions in that test; console loading and cross-add-on resource collisions were not tested.

### Host-state port

- Applies to: Features that need a vehicle's state to manage a host-bound camp entity.
- Rule: Features exchange host state through `VehicleHostLookup` next to `SpaceCheck`. Bootstrap passes the shared read-only port to camp; vehicle infrastructure supplies presence, pose, mount, driver presence, and motion without exposing vehicle domain objects. Unknown includes unloaded hosts; removed requires positive evidence.
- Agreement: Proposed
- Basis: [0200](../adr/0200-roof-tent-as-a-host-bound-camp-entity.md) Decision, "Features exchange host state through `VehicleHostLookup` next to `SpaceCheck`."
- Implementation: `src/application/shared/ports/vehicleHost.ts`; `src/infrastructure/vehicle/bedrock/bedrockVehicleWorld.ts`; `src/infrastructure/bootstrap.ts`
- Verification: `tests/infrastructure/vehicle/install.test.ts` "returns the vehicles' space check for other features (ADR 0122)". Not verified: this space-check test does not exercise the complete host-state lifecycle or roof tent integration.

### Infrastructure vehicle kinds

- Applies to: `src/infrastructure/vehicle/`.
- Rule: Kind-specific adapters, handlers and identifiers live in `kinds/<kind>/`. Only the root `install.ts` imports kinds from the core. Kinds may import core contracts but never another kind. The world adapter receives `DockLayer` and the standable-room predicate; camper installation preserves handler order through callbacks.
- Agreement: Accepted
- Basis: [0221](../adr/0221-organize-infrastructure-vehicle-code-by-kind.md) Decision.
- Implementation: `.dependency-cruiser.cjs`; `src/infrastructure/vehicle/install.ts`; `src/infrastructure/vehicle/bedrock/dockLayer.ts`; `src/infrastructure/vehicle/kinds/camper/install.ts`
- Verification: `tests/architecture.test.ts`; `tests/infrastructure/vehicle/install.test.ts`; `tests/infrastructure/vehicle/bedrock/subscriptions.test.ts`

## Open issues

- ADR 0001 says to use only stable `@minecraft/server` 2.x; the implementation also imports stable server-ui forms and declares that module in the main manifest, as introduced by Proposed 0178 and retained by Proposed 0198 (`src/infrastructure/build/bedrock/buildMenus.ts`, `package.json`, `packs/yasu_ride_bp/manifest.json`); the ADR needs an edit or a superseding ADR.
- ADR 0012 says import direction is checked by a test inspecting import statements, and ADR 0046 says the architecture test resolves relative imports and tests its parser; the implementation uses dependency-cruiser for the repository graph and architecture fixtures, as decided in 0065 (`.dependency-cruiser.cjs`, `tests/architecture.test.ts`); the ADR needs an edit or a superseding ADR.
- ADR 0065 says dependency-cruiser 18.5.0 and swc 1.16.13; the implementation pins newer versions in the `dependency-cruiser` and `@swc/core` package definitions, while its TypeScript definition still matches the ADR's TypeScript version (`package.json`); the ADR needs an edit or a superseding ADR.
- ADR 0046 says shared modules are vec and identifiers and the vehicle domain stays flat until another kind needs a split; the implementation has shared room, paint, sleep and synchronization modules plus vehicle core subcontexts, motion and kinds, as later decisions describe (`src/domain/shared`, `src/application/shared`, `src/infrastructure/shared`, `src/domain/vehicle`); the ADR needs an edit or a superseding ADR.
- ADR 0046 says house-building parts ship separately rather than as a feature here, and ADR 0047 describes an add-on holding only rides; the implementation includes the build feature and its separate namespace within the ride packs under Proposed 0178 and 0198 (`src/domain/build`, `src/application/build`, `src/infrastructure/build`, `packs/yasu_ride_bp/items/yasu_build`); the ADR needs an edit or a superseding ADR.
- ADR 0050 says every differing value lives in VehicleProfile, including motion limits, and lists a flat layout and aggregate-owned motion state; the implementation keeps only core-consumed profile data and delegates motion to per-kind drives and spec tables, as partly superseded by 0055 (`src/domain/vehicle/profile.ts`, `src/domain/vehicle/kinds`, `src/domain/vehicle/motion`); the ADR needs an edit or a superseding ADR.
- ADR 0050 says shared logic never branches on kind and event filters never compare a single vehicle type; the implementation explicitly branches on sportsboat in application fire protection and has kind-specific placement and camper light-switch routes (`src/application/vehicle/driveVehicles.ts`, `src/infrastructure/vehicle/bedrock/handlers/placement.ts`, `src/infrastructure/vehicle/bedrock/handlers/headlights.ts`); the ADR needs an edit or a superseding ADR.
- ADR 0055 says architecture import rules are enforced by tests/architecture.test.ts and keeps the core flat; the implementation uses dependency-cruiser and core subfolders under 0065 and 0090 (`.dependency-cruiser.cjs`, `src/domain/vehicle`); the ADR needs an edit or a superseding ADR.
- ADR 0055 says the boat keeps motion tuning in profile.ts and water tuning in drive.ts; the implementation derives these values from SPORTSBOAT_SPEC under the partial supersession in 0087 (`src/domain/vehicle/kinds/sportsboat/spec.ts`, `src/domain/vehicle/kinds/sportsboat/profile.ts`, `src/domain/vehicle/kinds/sportsboat/drive.ts`); the ADR needs an edit or a superseding ADR.
- ADR 0055 lists VehicleProfile as kind, seats, ram body, beams and placement; the implementation also includes fleet, footprint, boarding, camera, paint, interaction, gift, stand-in and monitor fields, and names its body field `body`, not `ram` (`src/domain/vehicle/profile.ts`); the ADR needs an edit or a superseding ADR.
- ADR 0055 lists targets() among TickContext queries; the implementation keeps it only on VehicleTickInput under 0083 and adds heldBlock, deckSeatInputs, lavaAt, blockTypes and awaitingDriver to the drive context (`src/domain/vehicle/drive.ts`, `src/domain/vehicle/vehicle.ts`); the ADR needs an edit or a superseding ADR.
- ADR 0055 describes a smaller Drive/DriveStep and snapshot contract; the implementation adds optional seat and tool hooks, the separate room capability (0220), dock/cut/pave/departure outputs, deck riders and test-held data (`src/domain/vehicle/drive.ts`, `src/application/vehicle/ports/drive.ts`); the ADR needs an edit or a superseding ADR.
- ADR 0055 reserves headlights and paint names for the core and sends seat commands last; the implementation also reserves the monitor property and moves leaving riders after the final command run (`src/domain/vehicle/entityContract.ts`, `src/application/vehicle/driveVehicles.ts`); the ADR needs an edit or a superseding ADR.
- ADR 0055 lists top and water placement surfaces and fixed clearance for the SUV and boat; the implementation supports lava and derives heights from each body's height, with kind profiles supplying horizontal clearance (`src/domain/vehicle/placement/placement.ts`, `src/domain/vehicle/kinds/suv/profile.ts`, `src/domain/vehicle/kinds/sportsboat/profile.ts`); the ADR needs an edit or a superseding ADR.
- ADR 0055 says commands are the only vocabulary the core uses to act on the world and to revisit it if the vocabulary grows past eight operations; the implementation has four EngineCommand types but DriveStep also carries non-command world operations such as dock, clear, cut, pave, message, depart and boardDeckRiders (`src/domain/vehicle/drive.ts`); the ADR needs an edit or a superseding ADR.
- ADR 0087 includes handbrakeGrip in the boat spec and refers to SPORTSBOAT_PROFILE.ram; the implementation removes that unused grip under 0089 and derives the profile's `body` instead (`src/domain/vehicle/kinds/sportsboat/spec.ts`, `src/domain/vehicle/kinds/sportsboat/profile.ts`); the ADR needs an edit or a superseding ADR.
- ADR 0090 places paint in vehicle/paint/paint.ts, syncedValue and hit-counter driving helpers in the core, and Cell/cellKey in lighting/headlights.ts; the implementation has no vehicle paint folder and puts paint, syncedValue, hitCounter and cells in domain/shared, with syncedValue's move described by 0129 (`src/domain/shared/paint.ts`, `src/domain/shared/syncedValue.ts`, `src/domain/shared/hitCounter.ts`, `src/domain/shared/cells.ts`, `src/domain/vehicle/lighting/headlights.ts`); the ADR needs an edit or a superseding ADR.
- ADR 0090 says application vehicle ports still mix contexts in ports.ts; the implementation splits them into the ports directory, and adds the monitor core subfolder (`src/application/vehicle/ports`, `src/domain/vehicle/monitor`); the ADR needs an edit or a superseding ADR.
- ADR 0129 says features see each other's space only through SpaceCheck and describes camp as claiming no space yet; the implementation additionally routes camp switch targets, claims tent space, and passes the combined vehicle/camp check to build (`src/infrastructure/bootstrap.ts`, `src/infrastructure/camp/install.ts`); the ADR needs an edit or a superseding ADR.
- ADR 0127 says to prime only the transforming drive's form and send form on rebuild only if it changes; the implementation also primes the sports boat icebreaker latch and deliberately resyncs a rebuilt bulldozer so its first step resends gravity and form (`src/domain/vehicle/kinds/sportsboat/drive.ts`, `src/domain/vehicle/kinds/bulldozer/drive.ts`); the ADR needs an edit or a superseding ADR.
- ADR 0127 says dock and undock one-shot commands retain their existing behavior without a retry; the implementation adds a retry specifically for their docked property under Proposed 0156 while still leaving the events one-shot (`src/domain/vehicle/kinds/sportsboat/drive.ts`, `src/domain/vehicle/kinds/camper/drive.ts`); the ADR needs an edit or a superseding ADR to distinguish the property from the transition events. Lost component-group events still have no retry, and owner acceptance of 0156 remains unverified.
- ADR 0047 gives the rename-time Resource Pack version and a smaller engine-fixed path list; the implementation uses the current manifest version and additionally treats catalogs, terrain and flipbook atlases, sounds.json and icons as fixed paths (`packs/yasu_ride_rp/manifest.json`, `packs/yasu_ride_bp/manifest.json`, `tests/packs/layout.test.ts`); the ADR needs an edit or a superseding ADR. The BP's Resource Pack dependency matches the current RP header; rename-time repository actions and other one-time migration consequences are not continuing rules.
- ADR 0178 says build requires a bulldozer, requests its chase camera and exposes a separate Build Tool; the implementation uses one wand on foot or riding, requests no camera change and uses contextual forms under Proposed 0198 (`src/infrastructure/bootstrap.ts`, `src/infrastructure/build/install.ts`, `src/infrastructure/build/bedrock/buildMenus.ts`, `packs/yasu_ride_bp/items/yasu_build/selection_wand.item.json`); the ADR needs an edit or a superseding ADR.
