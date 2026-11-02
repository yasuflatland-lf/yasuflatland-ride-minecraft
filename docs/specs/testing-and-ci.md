# Testing and CI

- Scope: Unit properties, mutation and unused-code checks, dependency updates, CI jobs and coverage, and the in-game test pack, runner protocol, scheduling, and local scenario selection.
- Verified at: 5ed1f579
- Source: [0010](../adr/0010-testing-strategy.md)
- Source: [0013](../adr/0013-dependency-updates-with-renovate.md)
- Source: [0048](../adr/0048-mutation-testing-and-unused-code-checks.md)
- Source: [0054](../adr/0054-shard-in-game-tests-in-ci.md)
- Source: [0057](../adr/0057-skip-model-check-when-inputs-unchanged.md)
- Source: [0088](../adr/0088-keep-the-in-game-test-fixtures-out-of-mutation.md)
- Source: [0186](../adr/0186-stream-in-game-results-and-bound-runs-by-progress.md)
- Source: [0187](../adr/0187-run-in-game-scenarios-in-concurrent-lanes.md)
- Source: [0188](../adr/0188-fuse-in-game-scenarios-and-keep-only-engine-facts-in-game.md)
- Source: [0189](../adr/0189-run-only-impacted-in-game-scenarios-locally.md)
- Source: [0193](../adr/0193-shared-texture-tooling.md)
- Source: [0204](../adr/0204-shard-unit-tests-across-ci-jobs.md)
- Excluded: [0139](../adr/0139-show-the-held-tool-on-the-cab-monitor.md): the monitor and its held-item test hook belong to the vehicle monitor specification; this spec covers the driving-input receiver only
- Excluded: [0205](../adr/0205-structured-adr-metadata-and-current-specs.md): ADR metadata, spec structure, and documentation checks belong to the documentation specification

## Rules

### Pure logic and unit properties

- Applies to: unit tests under `tests/`.
- Rule: `pnpm test` runs Vitest over `tests/**/*.test.ts`. Pure domain computation is separate from the game API. Tests use fast-check properties as well as examples; movement properties run generated input sequences against a simplified engine that applies friction or air drag and zeroes horizontal velocity at a wall. Engine-model constants are separate from controller tuning so some incorrect assumptions can be detected independently.
- Agreement: Accepted
- Basis: [0010](../adr/0010-testing-strategy.md) Decision, "Put pure computation (input conversion, driving computation, step detection, collision detection, choosing the driver) in modules that do not depend on the game API"; [0010](../adr/0010-testing-strategy.md) Decision, "Keep example-based tests for these to a minimum and use property-based tests (fast-check, vitest)."
- Implementation: `package.json` (`test`), `vitest.config.ts`, `tests/support/engineModel.ts`, `src/domain/vehicle/`, `.dependency-cruiser.cjs`
- Verification: `tests/domain/vehicle/motion/motion.test.ts` exercises generated sequences, friction, walls, speed bounds, and input conversion; `tests/domain/vehicle/motion/forms.test.ts` checks form transitions and vertical motion. Not verified: properties do not reproduce the whole engine, and no test enforces a maximum number of examples or requires every unit test to be a property. No tests were run for this spec.

### Manual device checks

- Applies to: occupant safety, camera feel, and rendering on PC and mobile.
- Rule: `docs/manual-test.md` supplies PC and Mobile result columns, occupant-damage checks while crashing and falling, driver and passenger camera ratings on a five-point scale with a passing rating of at least three, and visual checks. The columns are a checklist, not evidence of a completed device pass.
- Agreement: Accepted
- Basis: [0010](../adr/0010-testing-strategy.md) Decision, "Verify feel (smoothness of the driver camera, visuals) manually on real PC and mobile devices."; [0010](../adr/0010-testing-strategy.md) Decision, "Verify that occupants take no damage (0006) manually, because only players can sit in seats and a test cannot provide occupants"
- Implementation: `docs/manual-test.md`
- Verification: Not verified: no device pass was performed for this spec; unit mocks and cow-seat probes do not establish player safety or camera feel.

### Test-only pack and BDS driver

- Applies to: integration with the stable game API.
- Rule: `pnpm build` bundles the production entry and the separate test runner into their respective Behavior Packs. `pnpm test:game` runs a Node script that sends `scriptevent yasu_ride:test <request>` to the BDS process in `yasuflatland-ride-bds`, polls Docker logs for its run id, prints new lines, and exits successfully only for a summary with zero failures and no error. Tests construct tracks and drive vehicles through events. The harness uses no GameTest framework or `@minecraft/server-gametest` dependency.
- Agreement: Accepted
- Basis: [0010](../adr/0010-testing-strategy.md) Decision, "Verify integration with the game through in-game tests written in a test-only Behavior Pack."; [0010](../adr/0010-testing-strategy.md) Decision, "Do not use the GameTest framework (`@minecraft/server-gametest`)."
- Implementation: `scripts/build.mjs`, `scripts/game-test.mjs`, `src/test-pack/runner.ts`, `src/test-pack/protocol.ts`, `src/test-pack/arena.ts`, `package.json`, `packs/yasu_ride_test_bp/manifest.json`
- Verification: `tests/test-pack/resultLog.test.ts` checks run isolation and summary verdicts; `tests/test-pack/runner.test.ts` checks orchestration with a mocked engine; `tests/test-pack/nodeImport.test.ts` checks that Node can load shared pure modules. `tests/packs/layout.test.ts` checks namespace layout and path length for all three packs. Not verified: those tests do not execute Docker transport or enforce the absence of GameTest imports; no BDS run was performed for this spec.

### Production driving-input receiver

- Applies to: the test pack driving an empty vehicle through the production pack.
- Rule: `TEST_INPUT_EVENT` is `id("test_input")`, hence `yasu_ride:test_input`. The production handler accepts only that id with `sourceType` equal to `ScriptEventSource.Server`. Messages are `<vehicleId>,<moveX>,<moveY>,<jump>` or `<vehicleId>,clear`. The parser requires a nonempty vehicle id, exactly the appropriate field count, nonblank finite movement values, and jump `0` or `1`; it clamps movement to [-1, 1]. Invalid messages warn without replacing stored input. A map keeps the latest input, supports clear, and retains only loaded vehicle ids when the world adapter reads vehicles.
- Agreement: Accepted
- Basis: [0010](../adr/0010-testing-strategy.md) Decision, "The main pack accepts the event only when its `sourceType` is `Server`, rejects values that are not finite, and clamps `moveX` and `moveY` to [-1, 1]."
- Implementation: `src/infrastructure/vehicle/bedrock/identifiers.ts` (`TEST_INPUT_EVENT`), `src/infrastructure/shared/identifiers.ts`, `src/infrastructure/vehicle/bedrock/handlers/testInput.ts`, `src/infrastructure/vehicle/testInput/testInputMessage.ts`, `src/infrastructure/vehicle/testInput/vehicleTestStore.ts`, `src/infrastructure/vehicle/bedrock/bedrockVehicleWorld.ts`
- Verification: `tests/infrastructure/vehicle/bedrock/subscriptions.test.ts` rejects entity sources and other event ids, preserves input after invalid messages, and clears input; `tests/infrastructure/vehicle/testInput/testInputMessage.test.ts` covers finite values, clamping, blanks, field counts, and jump validation; `tests/infrastructure/vehicle/testInput/vehicleTestStore.test.ts` checks map operations and retain; `tests/infrastructure/vehicle/bedrock/bedrockVehicleWorld.test.ts` checks that unloading a vehicle forgets its input. Not verified: cross-pack event delivery on a live BDS in this spec review.

### Dependency updates

- Applies to: Renovate-managed dependencies and tool versions.
- Rule: `renovate.json` extends `config:recommended`, delays updates until `minimumReleaseAge` with strict `internalChecksFilter`, enables automerge for minor, patch, pin, and digest updates, and leaves majors for review. The later Stryker package rule disables automerge for that group. pnpm updates are grouped across its declarations. GitHub vulnerability alerts clear the release-age wait and add the security label; OSV alerts are enabled. These are configuration settings; external App installation and merge protections are not established by the file.
- Agreement: Accepted
- Basis: [0013](../adr/0013-dependency-updates-with-renovate.md) Decision, "Use Renovate, configured in `renovate.json`, for npm packages, `mise.toml`, and GitHub Actions"; [0013](../adr/0013-dependency-updates-with-renovate.md) Decision, "Update pnpm in `mise.toml` and `packageManager` together in one PR"; [0048](../adr/0048-mutation-testing-and-unused-code-checks.md) Decision, "Keep Renovate from merging `@stryker-mutator/*` updates automatically"
- Implementation: `renovate.json`, `package.json`, `mise.toml`
- Verification: Not verified: no test under `tests/` checks Renovate rules, external vulnerability alerts, App installation, or actual automerge after CI.

### Mutation testing

- Applies to: manual `pnpm test:mutation` runs.
- Rule: Stryker uses pnpm, the explicitly listed Vitest runner and TypeScript checker plugins, `vitest.config.ts`, `tsconfig.json`, and per-test coverage analysis. It mutates `src/**/*.ts` except `src/main.ts`, the test runner, arena, catalog, and every scenario file. Other pure helpers, including protocol and ram judging, remain eligible. `thresholds.high`, `thresholds.low`, and `thresholds.break` in `stryker.config.mjs` define score bands and the failure cutoff. Reports include clear text, progress, and `reports/mutation/index.html`. The `.pnpmfile.cjs` readPackage hook removes the TypeScript peer from Stryker core and checker and gives both the `STRYKER_TYPESCRIPT` dependency; the project compiler remains the version in `package.json`. No workflow runs mutation testing.
- Agreement: Accepted
- Basis: [0048](../adr/0048-mutation-testing-and-unused-code-checks.md) Decision, "Run StrykerJS with the vitest runner and the TypeScript checker through `pnpm test:mutation`, configured in `stryker.config.mjs`."; [0048](../adr/0048-mutation-testing-and-unused-code-checks.md) Decision, "Do not run mutation testing in CI."; [0088](../adr/0088-keep-the-in-game-test-fixtures-out-of-mutation.md) Decision, "Stryker does not mutate `src/test-pack/arena.ts` or any file under `src/test-pack/scenarios/`."
- Implementation: `stryker.config.mjs`, `.pnpmfile.cjs` (`STRYKER_TYPESCRIPT`, `readPackage`), `package.json`, `.github/workflows/`
- Verification: `tests/test-pack/catalog.test.ts` checks catalog metadata and registry consistency, not mutation exclusions. Not verified: no test checks the Stryker configuration, compiler hook, thresholds, or absence from CI; no mutation run or current score was obtained.

### Unused-code checks

- Applies to: local unused-code checking and the unit workflow quick job.
- Rule: `pnpm lint:unused` invokes knip. Explicit entries are the production and test-pack entry points and the declaration files for check-rp-version, dev-pack-version, and docs scripts. `knip.json` ignores `@swc/core`. CI runs knip after the format, language, and documentation checks and before the source-presence-gated checks.
- Agreement: Accepted
- Basis: [0048](../adr/0048-mutation-testing-and-unused-code-checks.md) Decision, "Run knip through `pnpm lint:unused`, configured in `knip.json`"
- Implementation: `package.json` (`lint:unused`), `knip.json`, `.github/workflows/unit-test.yml` (`quick`)
- Verification: Not verified: no test under `tests/` checks knip entries, the ignored dependency, or workflow ordering; knip was not run.

### Unit and release workflow layout

- Applies to: pull requests, pushes to main, and tag or manual releases.
- Rule: The unit workflow has `quick`, a two-shard `test` matrix with fail-fast disabled, `tools`, `coverage`, `model`, and the aggregate `check` job. `quick` installs frozen dependencies and runs format, language, docs, and unused-code checks; type, dependency, build, and package checks require `tsconfig.json`. `check` always runs, needs the five upstream job ids, prints their results, and fails unless all succeeded. The release workflow is separate: on a version tag or a manual main run it checks release notes and Resource Pack versioning, installs dependencies, runs typecheck and the unsharded `pnpm test`, builds and packages with the expected tag version, uploads artifacts, and creates the release in a separate job with write permission. It does not repeat every pull-request check.
- Agreement: Accepted
- Basis: [0204](../adr/0204-shard-unit-tests-across-ci-jobs.md) Decision, "Split the unit job into `quick`, a two-shard `test` matrix, `tools`, and `coverage`. Keep `model` unchanged."; [0204](../adr/0204-shard-unit-tests-across-ci-jobs.md) Decision, "Keep the required job id `check`."; [0013](../adr/0013-dependency-updates-with-renovate.md) Consequences, "Automerge relies on CI being the gate, so CI must keep covering lint, typecheck, test, and build"
- Implementation: `.github/workflows/unit-test.yml`, `.github/workflows/release.yml`, `package.json`
- Verification: `tests/scripts/checkRpVersion.test.ts` checks Resource Pack version comparison, not release orchestration. Not verified: no test under `tests/` executes or validates the workflow graph, required-status settings, release permissions, or all failure paths. ADR 0204 Consequences records historical CI failure-propagation checks, not a run for this spec.

### Python test selection and coverage merge

- Applies to: the unit workflow tools job, covered shards, and coverage job.
- Rule: The covered shards exclude `tests/tools/**`, `tests/support/pythonWorker.test.ts`, and `tests/packs/{litTextures,model,sportsboat,camper,suvPbr,headlights}.test.ts` while retaining Vitest defaults. The tools job runs without coverage or blob reports using CLI filters for `tests/tools/`, the Python worker test, `litTextures`, `model.test`, `sportsboat`, `camper.test`, `suvPbr`, and `headlights` under `tests/packs/`. These are substring filters: `sportsboat` also selects the equipment and monitor test files, which the covered shards do not exclude. Each covered shard writes `.vitest-reports/blob-<shard>.json` with coverage for `src/**` and uploads the hidden report directory with a one-day retention. After both shards succeed, `coverage` downloads and merges blob artifacts, produces text and LCOV reports when source is present, and attempts one Codecov upload with flag `unit`; upload errors do not fail CI.
- Agreement: Accepted
- Basis: [0204](../adr/0204-shard-unit-tests-across-ci-jobs.md) Decision, "Run the Python-backed tests in their own `tools` job, without coverage and without a blob report, in parallel with the covered shards."; [0204](../adr/0204-shard-unit-tests-across-ci-jobs.md) Decision, "After all test shards succeed, download and merge their artifacts in `coverage`, merge the Vitest reports, and produce text and LCOV coverage reports."
- Implementation: `.github/workflows/unit-test.yml` (`test`, `tools`, `coverage`), `vitest.config.ts`, `.gitignore`
- Verification: Inspection with grep finds Python invocations or `startPythonWorker` in the ADR-listed Python test set. `tests/support/pythonWorker.test.ts` checks the worker, and the selected pack and tool tests check generated assets. Not verified: no test under `tests/` asserts workflow partitioning or merged coverage equivalence; the CLI filters currently duplicate the sports boat equipment and monitor tests across jobs. No Python test or coverage merge was run.

### Coverage totals and status scope

- Applies to: local `pnpm test:coverage` and Codecov reporting.
- Rule: The local coverage command includes `src/**` and emits text and LCOV. Codecov keeps separate components for domain/application, infrastructure plus main, and the test pack, with core first. Project and patch statuses include domain, application, infrastructure, and main; they omit test-pack paths from status evaluation while retaining them in totals and their own component. Status tolerances come from `coverage.status.project.default.threshold` and `coverage.status.patch.default.threshold` in `codecov.yml`. There is no `after_n_builds` setting.
- Agreement: Accepted
- Basis: [0204](../adr/0204-shard-unit-tests-across-ci-jobs.md) Decision, "Upload `coverage/lcov.info` to Codecov once with the `unit` flag."; [0204](../adr/0204-shard-unit-tests-across-ci-jobs.md) Decision, "No `after_n_builds` setting is needed in `codecov.yml` because there is only one upload."
- Implementation: `package.json` (`test:coverage`), `codecov.yml`, `.github/workflows/unit-test.yml`
- Verification: Not verified: no test under `tests/` checks Codecov configuration or external status evaluation. ADR 0204 records a historical single-versus-merged comparison and small fast-check coverage variation; no current coverage measurement was made.

### Conditional model checks

- Applies to: the unit workflow model job.
- Rule: The model job checks out at depth two. On pull requests it diffs `HEAD^1` against `HEAD` and runs only if the path filter matches. Inputs include every top-level Python file via `tools/[^/]+\.py`, camping gear and monitor screen JSON, Resource Pack models, render controllers, entity/block/item textures, animations, terrain and item atlases, Behavior Pack blocks/items/item catalog, pack icons, docs images, package.json, mise.toml, and the unit workflow. Main pushes always run the check. A skipped render leaves the job successful without mise setup. An active job installs tools through mise and runs `pnpm run model:check` without a pnpm dependency install; the script checks generators, previews, and icons.
- Agreement: Proposed
- Basis: [0057](../adr/0057-skip-model-check-when-inputs-unchanged.md) Decision, "On a pull request, the `model` job checks out with depth 2"; [0057](../adr/0057-skip-model-check-when-inputs-unchanged.md) Decision, "A push to `main` always runs the check"; [0193](../adr/0193-shared-texture-tooling.md) Decision, "Widen the model CI job path filter to include every `tools/*.py` file."
- Implementation: `.github/workflows/unit-test.yml` (`model`), `package.json` (`model:check`)
- Verification: `tests/packs/model.test.ts`, `tests/packs/litTextures.test.ts`, and other generator tests check asset properties, not the workflow filter or every freshness invocation. Not verified: no test under `tests/` checks the filter, skip behavior, or successful tool setup without dependency installation; model:check was not run.

### In-game CI matrix

- Applies to: integration workflow runs on pull requests and main pushes.
- Rule: The in-game matrix has four serial shards, named `1/4` through `4/4`, and one unsharded `lanes` job with the lane count configured in its matrix entry. Fail-fast is disabled. Each job with a runner script installs dependencies, builds, prepares the dev world and permissions, starts its own compose BDS, waits for startup, and invokes `pnpm run test:game` with matrix `GAME_TEST_SHARD` and `GAME_TEST_LANES`. Failures dump the beginning and end of server logs; cleanup always stops compose. CI does not diff-select scenarios, but player-required scenarios still skip without a connected player.
- Agreement: Proposed
- Basis: [0054](../adr/0054-shard-in-game-tests-in-ci.md) Decision, "Run the in-game tests as a matrix of four jobs"; [0187](../adr/0187-run-in-game-scenarios-in-concurrent-lanes.md) Decision, "Keep the four CI shards at K = 1."; [0187](../adr/0187-run-in-game-scenarios-in-concurrent-lanes.md) Decision, "adds one unsharded CI job that runs everything in lanes."
- Implementation: `.github/workflows/integration-test.yml`, `scripts/game-test.mjs`, `src/test-pack/plan.ts`
- Verification: `tests/test-pack/plan.test.ts` checks that sharding partitions eligible scenarios and that absent-player scenarios skip before sharding. Not verified: no test under `tests/` validates the CI matrix, container startup, or log cleanup; no in-game CI run was made for this spec.

### Catalog and declared scenario budgets

- Applies to: every registered in-game scenario.
- Rule: The pure `CATALOG` holds name, file, declared ticks, feature tags, isolation, player requirement, peak vehicle count, and optional group and skip note. `SCENARIOS` maps names to executable functions. Catalog tests require unique names, nonnegative integer ticks and vehicle counts, ticks at most `MAX_SCENARIO_TICKS` from deadline.ts, nonempty unique valid tags, exclusive isolation for player scenarios, lane isolation for grouped scenarios, existing files, and exact registry correspondence. The runner also rejects a catalog/registry mismatch before setup. These tick values estimate work; the runner measures actual elapsed ticks for result lines and does not stop a scenario at its declared budget.
- Agreement: Proposed
- Basis: [0187](../adr/0187-run-in-game-scenarios-in-concurrent-lanes.md) Decision, "Scenario metadata lives in a pure catalog."; [0186](../adr/0186-stream-in-game-results-and-bound-runs-by-progress.md) Decision, "A scenario declares at most 300 ticks."; [0054](../adr/0054-shard-in-game-tests-in-ci.md) Decision, "Every result line carries `ticks=`."
- Implementation: `src/test-pack/catalog.ts`, `src/test-pack/scenarios/index.ts`, `src/test-pack/deadline.ts` (`MAX_SCENARIO_TICKS`), `src/test-pack/runner.ts`
- Verification: `tests/test-pack/catalog.test.ts` validates metadata and correspondence; `tests/test-pack/runner.test.ts` checks elapsed ticks in results. Not verified: catalog tests do not measure live ticks, enforce a runtime per-scenario timeout, prove peak vehicles, or classify each assertion as an engine fact.

### Tick-based sharding and lane planning

- Applies to: selection and scheduling within one in-game run.
- Rule: Planning filters features, then player availability, then shards, then lanes. `packByTicks` assigns items in descending declared ticks to the lightest bin, breaking equal-tick ties by original position and equal-load ties by lower bin. `shardsOf` converts bins to one-based shard indices; every shard retains catalog order. With multiple lanes, grouped scenarios are packed together by their summed ticks, retain member order, and share one lane; the catalog uses the tent group. Exclusive scenarios wait until all lanes finish and vehicles are removed, then run on lane zero. With one lane, all selected scenarios retain catalog order and no separate exclusive phase runs. Makespan is the largest lane tick sum plus exclusive ticks.
- Agreement: Proposed
- Basis: [0054](../adr/0054-shard-in-game-tests-in-ci.md) Decision, "`shardsOf` packs the tests slowest first, each into the slice with the fewest ticks so far, breaking ties by list position and then by the lower slice"; [0187](../adr/0187-run-in-game-scenarios-in-concurrent-lanes.md) Decision, "Apply filters in this order: features, player, shard, then lanes."; [0187](../adr/0187-run-in-game-scenarios-in-concurrent-lanes.md) Decision, "Scenarios sharing a group are packed as one unit."
- Implementation: `src/test-pack/plan.ts` (`packByTicks`, `shardsOf`, `planOf`, `packLanes`), `src/test-pack/runner.ts`
- Verification: `tests/test-pack/plan.test.ts` checks deterministic packing, ties, exactly-once coverage, ordering, grouping, filtering, load bounds, and makespan; `tests/test-pack/runner.test.ts` checks concurrent lanes, isolated scenario errors, and vehicle removal before exclusives. Not verified: these use generated metadata and mocked engine calls, not actual concurrent engine isolation.

### Lane limits and geometry

- Applies to: local and CI lane requests and coordinate conversion.
- Rule: Lane requests are positive integers up to `MAX_LANES`. Local runs default to `LOCAL_DEFAULT_LANES`; nonempty CI or shard settings default to serial, and valid explicit `GAME_TEST_LANES` wins. `GAME_TEST_AT` selects a lane index, defaults to serial unless lanes are explicit, and cannot combine a nonzero index with multiple lanes. Planning caps concurrency by `MAX_LANE_VEHICLES` divided by the largest lane scenario vehicle count, with a minimum denominator and lane count of one. Arena bounds are `LOCAL_ARENA`; origin x is the index times `LANE_STRIDE`, z is zero. Ticking bounds grow by `AREA_MARGIN`; names are `yasu_ride_arena` and `yasu_ride_arena_<index>`. Conversion preserves height and other fields.
- Agreement: Proposed
- Basis: [0187](../adr/0187-run-in-game-scenarios-in-concurrent-lanes.md) Decision, "Every scenario coordinate is local to a lane."; [0187](../adr/0187-run-in-game-scenarios-in-concurrent-lanes.md) Decision, "Its ticking area is the arena grown by 16 blocks on every side"; [0187](../adr/0187-run-in-game-scenarios-in-concurrent-lanes.md) Consequences, Measured results, "Local runs use K = 4 (`LOCAL_DEFAULT_LANES`)"
- Implementation: `src/test-pack/protocol.ts` (`MAX_LANES`, `LOCAL_DEFAULT_LANES`), `src/test-pack/plan.ts` (`MAX_LANE_VEHICLES`, `laneCountOf`), `src/test-pack/lane.ts` (`LOCAL_ARENA`, `AREA_MARGIN`, `LANE_STRIDE`), `scripts/game-test.mjs`
- Verification: `tests/test-pack/lane.test.ts` checks round trips, bounds, disjoint areas, chunk counts, names, and invalid indices; `tests/test-pack/protocol.test.ts` checks defaults and valid ranges; `tests/test-pack/plan.test.ts` checks vehicle headroom against `SPEC.maxUnownedVehicles` and concurrency reduction. Not verified: runtime planning does not read the fleet cap, and geometry tests do not establish actual chunk loading in BDS.

### Arena setup and cleanup

- Applies to: preparing a run before READY.
- Rule: Setup removes only `SERIES_AREAS`, adds every lane area up to `MAX_LANES`, and waits within a bound for their corners to load. It checks equal ground height for used lanes, kills the listed fixture entities world-wide, removes unused lane areas, and fills used lanes with a tick between lanes. Clearing is split into smaller fill commands. Arena fills require loaded corners but do not require a positive successCount; ticking-area addition and pool filling have separate successCount checks. Multi-lane exclusive scheduling removes every loaded vehicle of the listed types before starting exclusives.
- Agreement: Proposed
- Basis: [0187](../adr/0187-run-in-game-scenarios-in-concurrent-lanes.md) Decision, "Remove the series' own named areas. Never use `remove_all`, so the owner's areas survive."; [0187](../adr/0187-run-in-game-scenarios-in-concurrent-lanes.md) Decision, "Run the world-wide entity kills."
- Implementation: `src/test-pack/arena.ts` (`prepareRun`, `removeVehicles`, `withPool`), `src/test-pack/lane.ts` (`SERIES_AREAS`)
- Verification: `tests/test-pack/lane.test.ts` checks series names and geometry; `tests/test-pack/runner.test.ts` checks setup before READY and vehicle-removal ordering using mocks. Not verified: there is no arena implementation test for command order, fill changes, live corner loading, or preservation of owner areas. No test found asserts summon instead of spawnEntity, so that fixture convention is not stated here as a verified rule.

### Streaming log protocol

- Applies to: logs belonging to a test run.
- Rule: Every run line begins with `LOG_TAG` and the run id. Before setup, the runner logs `PLAN runs=<n> skipped=<m> unselected=<u> ticks=<makespan> lanes=<K>` and `SKIP <name>: <reason>` lines; it logs READY after setup. Step completions stream as `<scenario> step <step> PASS|FAIL <detail>`. A scenario completes with `PASS|FAIL <name> ticks=<elapsed>[ lane=<index>] <detail>` followed synchronously by extra lines. Lane indices appear for multi-lane runs. SUMMARY contains pass, fail, elapsed ticks, wall ms, and an optional error. The Node driver filters by the exact run prefix and judges the first SUMMARY, so another run or error text cannot fake success.
- Agreement: Proposed
- Basis: [0186](../adr/0186-stream-in-game-results-and-bound-runs-by-progress.md) Decision, "Before setup, the runner logs `PLAN"; [0186](../adr/0186-stream-in-game-results-and-bound-runs-by-progress.md) Decision, "After setup, it logs `READY`."; [0186](../adr/0186-stream-in-game-results-and-bound-runs-by-progress.md) Decision, "When a scenario ends, the runner logs `PASS|FAIL <name> ticks=<n>[ lane=<k>] <detail>` and that scenario's extra lines in one synchronous loop."
- Implementation: `src/test-pack/resultLog.ts`, `src/test-pack/runner.ts`, `src/test-pack/outcome.ts`, `scripts/game-test.mjs`
- Verification: `tests/test-pack/resultLog.test.ts` checks formats, parsing, isolation, and summary errors; `tests/test-pack/runner.test.ts` checks PLAN/SKIP/READY order, immediate steps, results, lane indices, and final summaries. Not verified: Docker log polling and inter-pack execution are not exercised by those unit tests.

### Run requests, busy guard, and cancellation

- Applies to: `yasu_ride:test` and `yasu_ride:test_cancel` requests.
- Rule: Valid run ids accept a positional shard or keyed `shard`, `lanes`, `at`, and `features` tokens. Invalid, unknown, duplicate, or conflicting tokens under a valid id produce an error SUMMARY; unknown feature tags also fail before setup. A first token outside the run-id pattern falls back to a manual whole serial run and ignores trailing tokens. A noncancelled active run rejects another request. A cancel event matching the active id marks it cancelled and logs an error SUMMARY; later scenario output is suppressed. A replacement can be accepted immediately but waits for the previous settled promise before setup, because cancellation cannot interrupt in-flight engine mutations. Requests are formatted within `MESSAGE_LIMIT`.
- Agreement: Proposed
- Basis: [0186](../adr/0186-stream-in-game-results-and-bound-runs-by-progress.md) Decision, "Reject a malformed request with an error SUMMARY under its own run id."; [0186](../adr/0186-stream-in-game-results-and-bound-runs-by-progress.md) Decision, "The script event `yasu_ride:test_cancel <runId>` ends that run"
- Implementation: `src/test-pack/protocol.ts` (`parseRunRequest`, `formatRunRequest`, `MESSAGE_LIMIT`), `src/test-pack/runner.ts`
- Verification: `tests/test-pack/protocol.test.ts` checks round trips, malformed tokens, fallback, ranges, and message limits; `tests/test-pack/runner.test.ts` checks matching cancellation, suppressed output, queued cancellation, validation, and busy guards. Not verified: cancelling a permanently hung promise does not prove that a replacement will start; no live cancellation was attempted.

### Progress watchdog

- Applies to: the Node command waiting for a run.
- Rule: The command polls logs and counts any new run-prefixed line as progress. Failed log retrieval adds no progress. The first observed PLAN fixes a deadline at observation time plus `deadlineMsOf(ticks)`: the ceiling in milliseconds of ticks divided by `TPS`, multiplied by `DEADLINE_FACTOR`, plus `SETUP_MARGIN_MS`. Later plans and progress do not extend it. A gap strictly greater than `STALL_MS` is stalled; otherwise passing the deadline is overdue. Either verdict sends `CANCEL_EVENT` and exits with failure; SIGINT also attempts cancellation. `MAX_SCENARIO_TICKS` is derived from the stall window and `TPS` for declared catalog budgets.
- Agreement: Proposed
- Basis: [0186](../adr/0186-stream-in-game-results-and-bound-runs-by-progress.md) Decision, "Any new line of the run counts as progress, including PLAN, SKIP, READY, and step lines."; [0186](../adr/0186-stream-in-game-results-and-bound-runs-by-progress.md) Decision, "On either condition, the command sends the cancel event and exits 1."
- Implementation: `src/test-pack/deadline.ts` (`TPS`, `DEADLINE_FACTOR`, `SETUP_MARGIN_MS`, `STALL_MS`, `deadlineMsOf`, `MAX_SCENARIO_TICKS`), `scripts/game-test.mjs`
- Verification: `tests/test-pack/deadline.test.ts` checks monotonic budgets, strict boundaries, failed-poll stalling, and a deadline fixed on the first plan; `tests/test-pack/resultLog.test.ts` checks run-line isolation. Not verified: Docker polling, signal delivery, and real elapsed-time behavior under low TPS have no command-level test.

### Feature tags and ordered impact rules

- Applies to: automatic local selection of in-game scenarios.
- Rule: The closed tags are `build`, `camp`, `vehicle`, `vehicle:suv`, `vehicle:camper`, `vehicle:sportsboat`, and `vehicle:bulldozer`. A changed `vehicle` covers every kind tag. The first matching impact rule returns all, none, or tags. Harness files and listed external harness imports, shared code, entry/install files, manifests, dependencies, runtime scripts, and server paths select all. Registry-only changes select none; scenario-file tags are the union of catalog entries for that file. Feature folders, motion mappings, and pack stems map to tags; unknown paths or pack stems select all. Docs, tests, remaining scripts/tools, generated scripts, and most Resource Pack changes select none. Resource Pack block models are an earlier exception mapped through pack stems, and `tools/camping_gear.json` maps to camper.
- Agreement: Proposed
- Basis: [0189](../adr/0189-run-only-impacted-in-game-scenarios-locally.md) Decision, "A static, ordered rule table maps each changed path to `all`, `none`, or tags. The first match wins."; [0189](../adr/0189-run-only-impacted-in-game-scenarios-locally.md) Decision, "A changed `vehicle` covers every `vehicle:*` scenario."
- Implementation: `src/test-pack/features.ts`, `src/test-pack/impact.ts` (`IMPACT_RULES`, `HARNESS_IMPORTS`, `MOTION_TAGS`, `PACK_STEM_TAGS`), `src/test-pack/catalog.ts`
- Verification: `tests/test-pack/features.test.ts` checks tag recognition and coverage; `tests/test-pack/impact.test.ts` checks tracked path/stem mappings, harness and scenario imports, literal pack ids, motion reach, unions, monotonic selection, and registry/scenario changes together. Not verified: static checks do not prove every dynamic or indirect dependency has complete per-scenario tags.

### Git base and selection overrides

- Applies to: the Node driver before contacting BDS.
- Rule: Explicit valid `GAME_TEST_FEATURES` overrides diff selection, including when CI or shard settings exist. Otherwise nonempty CI or `GAME_TEST_SHARD`, or exactly `GAME_TEST_ALL=1`, selects the whole suite. Automatic selection uses `git diff --name-only --no-renames <base>` plus untracked files, with base from `GAME_TEST_BASE` or `git merge-base HEAD origin/main`, without fetching. Git failure falls back to all. If no scenario matches the automatically selected features, the command exits successfully before contacting Docker. Selected tags travel in one `features=` token, not as a list of scenario names. By default, a local `pnpm test:game` runs only the scenarios impacted by the diff against the merge base, rather than all scenarios, in `LOCAL_DEFAULT_LANES` lanes (currently 4); `GAME_TEST_ALL=1` runs everything.
- Agreement: Proposed
- Basis: [0189](../adr/0189-run-only-impacted-in-game-scenarios-locally.md) Decision, "The base is `GAME_TEST_BASE`, or otherwise `git merge-base HEAD origin/main`."; [0189](../adr/0189-run-only-impacted-in-game-scenarios-locally.md) Decision, "A git failure selects everything, and an empty selection exits 0 without contacting the BDS."; [0189](../adr/0189-run-only-impacted-in-game-scenarios-locally.md) Decision, "An explicit `GAME_TEST_FEATURES` wins over the diff."
- Implementation: `scripts/game-test.mjs` (`changedPaths`, `impactedFeatures`), `src/test-pack/impact.ts` (`mustRunAll`, `selectionOf`), `src/test-pack/protocol.ts` (`formatRunRequest`, `defaultLanesOf`, `LOCAL_DEFAULT_LANES`)
- Verification: `tests/test-pack/impact.test.ts` checks full-run environment predicates and pure selection; `tests/test-pack/protocol.test.ts` checks feature token formatting and message limits. Not verified: no test under `tests/scripts/` executes game-test.mjs for git failure, base resolution, Docker avoidance, or explicit-feature precedence.

### Fused courses and engine observations

- Applies to: in-game courses and their pure result helpers.
- Rule: The registry contains fused flight, submarine, parked-camper, bulldozer paving and tool courses, and boat docking and chair courses. `runCourse` executes steps sequentially, converts exceptions to failures, streams executed results, and normally stops after the first failure unless configured otherwise. Aggregate success requires exactly one passing result for each expected step and no unexpected result. Engine scenarios inspect motion, real blocks, properties, components, and timing; the boat-shore loop can stop when `settledAt` observes consecutive speeds below its threshold. Catalog tests enforce declared budgets and registration, not an engine-only assertion policy or a one-vehicle-per-course runtime invariant.
- Agreement: Proposed
- Basis: [0188](../adr/0188-fuse-in-game-scenarios-and-keep-only-engine-facts-in-game.md) Decision, "The course reports each former scenario as a step through `runCourse`."; [0188](../adr/0188-fuse-in-game-scenarios-and-keep-only-engine-facts-in-game.md) Decision, "End fixed waits early once the observed state has settled."; [0188](../adr/0188-fuse-in-game-scenarios-and-keep-only-engine-facts-in-game.md) Decision, "An in-game scenario asserts only what the engine can show: physics, collision, real blocks and permutations, entity components, or engine timing."
- Implementation: `src/test-pack/outcome.ts` (`runCourse`, `outcomeOfSteps`), `src/test-pack/settle.ts`, `src/test-pack/scenarios/index.ts`, `src/test-pack/scenarios/suv.ts`, `src/test-pack/scenarios/camper.ts`, `src/test-pack/scenarios/sportsboat.ts`, `src/test-pack/scenarios/roadPaver.ts`, `src/test-pack/scenarios/camp.ts`
- Verification: `tests/test-pack/outcome.test.ts` checks sequencing, immediate streaming, exceptions, stopping policy, sink failures, missing and duplicate steps; `tests/test-pack/settle.test.ts` checks earliest consecutive completion; `tests/test-pack/catalog.test.ts` checks metadata and registry coverage. `tests/domain/vehicle/kinds/bulldozer/paver.test.ts` covers the build-tool predicate moved out of the game. Not verified: no unit test proves all live assertions are engine-only, preserves every calibration across future edits, or measures actual course ticks and peak vehicles.

## Open issues

- ADR 0010 says the test input event is `mycar:test_input`; the implementation constructs `yasu_ride:test_input` through `id()` (`src/infrastructure/vehicle/bedrock/identifiers.ts`, `src/infrastructure/shared/identifiers.ts`); the ADR needs an edit or a superseding ADR.
- ADR 0013 says GitHub Actions are referenced by major tag in Context; the implementation also pins mise and Codecov actions to commit SHAs (`.github/workflows/unit-test.yml`, `.github/workflows/integration-test.yml`, `.github/workflows/release.yml`); the ADR needs an edit or a superseding ADR.
- ADR 0048 says patch the Vitest runner under `patches/`, and its Consequences also describe patch-update installation failures; the implementation uses the released Stryker version in `package.json`, has no `patches/` directory or patchedDependencies, and retains only the compiler hook (`.pnpmfile.cjs`); the same ADR Consequences records that the patch was removed; the ADR needs an edit or a superseding ADR.
- ADR 0048 says mutation excludes only main and the test runner; the implementation also excludes arena, catalog, and scenarios (`stryker.config.mjs`); ADR 0088 accounts for arena and scenarios but not catalog; the ADR needs an edit or a superseding ADR.
- ADR 0088 says every other source file stays mutated after excluding main, runner, arena, and scenarios; the implementation also excludes `src/test-pack/catalog.ts` (`stryker.config.mjs`); the ADR needs an edit or a superseding ADR.
- ADR 0048 says knip has main and the test runner as explicit entries; the implementation also lists three script declaration entry files and ignores `@swc/core` (`knip.json`); the ADR needs an edit or a superseding ADR.
- ADR 0048 says knip runs in CI after the other lint checks; the implementation runs `lint:unused` after biome ci, lint:lang, and lint:docs but before the `tsconfig.json`-gated typecheck and lint:deps (`.github/workflows/unit-test.yml`, `quick`); the ADR needs an edit or a superseding ADR.
- ADR 0048 describes a patched Vitest runner, and the implementation removed the patch, but config files still describe it: the Stryker rule description in `renovate.json` says the vitest runner patch is pinned to its version, and the comment above `thresholds` in `stryker.config.mjs` says a vitest runner patch may have stopped matching; no `patches/` directory exists; the config text needs an edit, and the ADR needs an edit or a superseding ADR.
- ADR 0054 says there are four in-game jobs and the unit workflow has unit, model, and an aggregate needing both; the implementation adds the unsharded lanes job and splits the unit side into quick, test, tools, coverage, model, and check (`.github/workflows/integration-test.yml`, `.github/workflows/unit-test.yml`); ADRs 0187 and 0204 describe the extensions; the ADR needs an edit or a superseding ADR.
- ADR 0054 says each runner test-list entry carries ticks, with Context describing 28 tests; the implementation stores the expanded scenario metadata and tick estimates in the separate `CATALOG`, rather than the executable registry (`src/test-pack/catalog.ts`, `src/test-pack/scenarios/index.ts`); the ADR needs an edit or a superseding ADR.
- ADR 0057 says the model filter lists renderer paths and leaves out gen_model.py and gen_sportsboat.py; the implementation matches every top-level Python tool plus generator data, render controllers, block/item textures and atlases, and Behavior Pack blocks/items/catalog (`.github/workflows/unit-test.yml`); ADR 0193 replaces the Python-file exclusion but does not enumerate all the other added paths; the ADR needs an edit or a superseding ADR.
- ADR 0186 says PLAN ticks is the sum of the declared run ticks; the implementation logs `plan.makespanTicks`, the longest lane plus exclusive work (`src/test-pack/runner.ts`, `src/test-pack/plan.ts`); the ADR needs an edit or a superseding ADR.
- ADR 0186 says a malformed request is rejected with an error SUMMARY under its own run id; the implementation falls back to a manual whole serial run for a first token that fails RUN_ID, ignoring trailing tokens; only malformed tokens after a valid id are rejected (`src/test-pack/protocol.ts`, `parseRunRequest`); the ADR needs an edit or a superseding ADR.
- ADR 0186 says cancellation logs nothing more and releases the busy guard; the implementation emits an error SUMMARY at cancellation and accepts a replacement whose setup waits for the cancelled run to settle (`src/test-pack/runner.ts`); a permanently hung promise can therefore keep the replacement waiting; the ADR needs an edit or a superseding ADR.
- ADR 0186 says overdue time is measured since PLAN using a ceiling in seconds; the implementation starts at the first poll observing PLAN and rounds in milliseconds (`src/test-pack/deadline.ts`, `scripts/game-test.mjs`); the ADR needs an edit or a superseding ADR.
- ADR 0187 says single-lane runs use LPT with exclusive scenarios last; the implementation preserves the selected catalog order when the effective lane count is one (`src/test-pack/plan.ts`, `planOf`); the ADR needs an edit or a superseding ADR.
- ADR 0187 says concurrency is bounded by `SPEC.maxUnownedVehicles - 2`; the implementation uses independent `MAX_LANE_VEHICLES` in planning; a property test, rather than the planner, checks fleet-cap headroom (`src/test-pack/plan.ts`, `tests/test-pack/plan.test.ts`); the ADR needs an edit or a superseding ADR.
- ADR 0187 says setup asserts that every fill changed blocks; the implementation checks arena corner loading and ignores arena-fill successCount because a rerun can fill air over air; positive successCount is checked for area addition and pool filling (`src/test-pack/arena.ts`); the ADR needs an edit or a superseding ADR.
- ADR 0188 says the audit removed `dutch_oven_on_pit` as a duplicate of `fire_pit_covered_take_back`; the implementation registers both; the former checks hosted-oven simmering and standing height, while the latter checks covered hits and take-back (`src/test-pack/catalog.ts`, `src/test-pack/scenarios/index.ts`, `src/test-pack/scenarios/camp.ts`); the ADR needs an edit or a superseding ADR.
- ADR 0189 says Resource Pack-only changes select nothing and scripts select everything; the implementation selects tags for Resource Pack block models and selects nothing for nonruntime scripts after the earlier runtime-script rule (`src/test-pack/impact.ts`); the ADR needs an edit or a superseding ADR.
- ADR 0204 says the Python set is excluded from covered shards so every test runs exactly once; the implementation passes a broad `tests/packs/sportsboat` substring filter to tools, also selecting `sportsboatEquipment.test.ts` and `sportsboatMonitor.test.ts`, while covered shards exclude only `sportsboat.test.ts` from those three (`.github/workflows/unit-test.yml`, `tests/packs/`); the installed Vitest filterFiles implementation confirms substring matching; the ADR needs an edit or a superseding ADR.
