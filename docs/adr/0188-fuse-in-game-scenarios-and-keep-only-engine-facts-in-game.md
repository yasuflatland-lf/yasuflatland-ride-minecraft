# 0188. Fuse in-game scenarios and keep only engine facts in game

- Status: Proposed
- Date: 2026-10-30
- Extends: 0010

## Context

The sequential in-game suite takes about 391 seconds at 20 TPS. Scenarios repeat spawn, park, take-off, dive, and drive setup, and some checks concern logic that property tests can cover. The testing strategy already separates pure computation from integration with the engine (0010). Reducing repeated setup and logic checks leaves game time for facts that only the engine can show.

## Decision

An in-game scenario asserts only what the engine can show: physics, collision, real blocks and permutations, entity components, or engine timing. Move an assertion about logic that a property test can cover to a property test under `tests/` and remove it from the game. Logic already covered is checked in game at most once, as a smoke check or a 0-tick engine probe.

Fuse scenarios that repeat the same spawn, park, take-off, dive, or drive setup into one course. The course reports each former scenario as a step through `runCourse`. A course respects the 300-tick cap (0186) and keeps one fleet vehicle alive at a time.

Remove exact duplicates and prefix scenarios. End fixed waits early once the observed state has settled. The engine-calibration scenarios behind `tests/support/engineModel.ts` may be fused, but never deleted. When a fusion narrows an assertion region to make room for another step, the PR says so.

## Consequences

Repeated setup and logic checks take less in-game time, while engine calibration remains covered. A fusion can narrow an assertion region; the PR makes that tradeoff visible. Part 22/22 of the series (#930) appends an audit table with the scenario, verdict, and where the check lives now, built from the audit sections of parts 16/22 to 21/22 (#924-#929).

### Audit table

Each row is the verdict of the shift-left audit in parts 16/22 to 21/22 (#924-#929).

| Scenario | Verdict | Where the check lives now |
|---|---|---|
| `bulldozer_pave_flat`, `_hole`, `_kept`, `_cliff` | Engine fact | Fused into `bulldozer_pave_course`, steps `flat`, `kept`, `hole`, `cliff` |
| `bulldozer_pave_no_block`: empty hand, door, bed, door drive | Engine fact | In game, steps `held_probe` and `door_drive` |
| `bulldozer_pave_no_block`: build tool is not a road block | Logic | `tests/domain/vehicle/kinds/bulldozer/paver.test.ts` |
| `bulldozer_monitor`, `_wide_blade_toggle`, `_road_paver_toggle` | Engine fact | Fused into `bulldozer_tools`, three steps |
| `camper_bunk_cells`, `camper_stand_spots`: cell and spot geometry | Logic | `tests/domain/vehicle/kinds/camper/room.test.ts` and `drive.test.ts` |
| `camper_bunk_cells`, `camper_stand_spots`: block at each cell or spot | Engine fact | `camper_park_course` steps |
| Eleven other parked-camper scenarios | Engine fact | `camper_park_course` steps |
| `camper_takeoff` | Engine fact | Folded into `camper_land` |
| `flight_takeoff`, `flight_cruise`, `flight_climb_descend` | Engine fact | `flight_course`; the take-off check moved into `withAirborneCar` |
| `submarine_dive`, `submarine_bank`, `submarine_breach` | Engine fact | `submarine_course`, three steps |
| `boat_deck_seats` | Engine fact | Fused into `boat_dock`, step `deck_seats` |
| `boat_shore`: fixed 120-tick wait | Engine fact | Ends when `settledAt` finds the boat at rest; logic in `settle.test.ts` |
| `dutch_oven_on_pit`: replay of `fire_pit_covered_take_back` | Duplicate | `fire_pit_covered_take_back` |
| `noga_chair_seat_and_take_back` | Duplicate | `low_chair_seat_and_take_back`, step `noga_chair` |
| `camping_gear_blocks`: gear count is 17 | Logic | `tests/packs/campingGear.test.ts` |
| `fleet_forget`: which car is evicted | Logic | Fleet properties in `tests/domain/vehicle/fleet/` |
| `build_block_states`: protected predicate | Logic | `tests/infrastructure/build/bedrock.test.ts` |
| `build_edits` (now [Build Wand scenarios](../manual-test.md#build-wand-in-game-scenarios)): fill and undo messages and counts | Logic | Application edit tests |
| `build_selection_and_mode` (now [build_flow_cancel](../manual-test.md#build-wand-in-game-scenarios)): corner messages, coordinates, volume | Logic | `tests/application/build/selection.test.ts` |
| `build_corner_marker_*` | Logic | Selection properties in `tests/application/build/selection.test.ts`; scenarios removed |
| `blade_cut_*`, `tent_*`, other `build_*` and `camping_gear_blocks` checks | Engine fact | Unchanged in game |

The fusion in part 16/22 narrowed the pave assertion ranges so the four former scenarios could share one drive along `PAVE_STRIP`:

| Step | Before | After |
|---|---|---|
| `flat` | x 93-98 | x 93-95 |
| `kept` | chest at x 96 | chest at x 97 |
| `hole` | x 100 | x 100 |
| `cliff` | `inCliff` over x 92/93-110 | `inCliff` and the `lane` planks over x 103-110 |
