# 0187. Run in-game scenarios in concurrent lanes

- Status: Proposed
- Date: 2026-10-30
- Extends: 0054

## Context

The in-game scenarios run one after another in one arena. Four CI shards shorten the CI wait (0054), but an unsharded local run still takes about 391 seconds at 20 TPS. The series aims to bring that run below five minutes while CI keeps running every scenario. Concurrent scenarios need separate space and must respect fleet and tent limits shared by the whole world.

## Decision

Scenario metadata lives in a pure catalog. Each `ScenarioSpec` holds its name and file, declared ticks, feature tags, isolation (`lane` or `exclusive`), an optional group, `needsPlayer`, and `vehicles`. The `vehicles` value is the most unowned fleet vehicles the scenario keeps alive at once.

Every scenario coordinate is local to a lane. The local arena spans x 0-120 and z 0-90. Lane `i` has its world origin at x = 160 * i, z = 0. Its ticking area is the arena grown by 16 blocks on every side, covering 80 chunks. Neighbouring lanes' areas sit in adjacent chunk columns, so a vehicle that runs out of its arena stays loaded and its scenario's cleanup can still remove it. Name the areas `yasu_ride_arena` for lane 0 and `yasu_ride_arena_<i>` otherwise.

Once per run, perform setup in this order:

1. Remove the series' own named areas. Never use `remove_all`, so the owner's areas survive.
2. Add all eight lane areas.
3. Wait, up to a bound, until every lane's corners have loaded.
4. Run the world-wide entity kills.
5. Remove the areas of lanes this run does not use.
6. Fill the used lanes one lane per tick, and assert that every fill changed blocks.

Apply filters in this order: features, player, shard, then lanes. Pack lane scenarios into K lanes by declared ticks, using the same longest-processing-time-first (LPT) rule as `shardsOf` (0054). Scenarios sharing a group are packed as one unit. The only group is `tent`, because the world allows four tents.

Exclusive scenarios run alone after every lane has finished and every vehicle has been removed. These are `vehicle_limit`, `fleet_forget`, and every player-bound `build_*` scenario.

K is at most 8, and K times the largest lane scenario's `vehicles` value is at most `SPEC.maxUnownedVehicles - 2`, because the unowned cap is per world. K = 1 runs the same scenarios as today in a single lane, but not in today's order: lane scenarios are packed by LPT and exclusive scenarios run last, so the order within a shard changes.

Keep the four CI shards at K = 1. Part 22/22 of the series (#930) adds one unsharded CI job that runs everything in lanes.

## Consequences

The per-tick script cost grows with K, which lowers TPS and stretches wall time without changing tick counts. Part 22/22 adds measurements to assess the resulting run time.

### Measured results (part 22/22)

Measured on the dev BDS in Docker on a developer Mac, with no player connected. Local runs use K = 4 (`LOCAL_DEFAULT_LANES`); K = 4 finished well under the 240 s threshold at which the constant would be raised, so it stays 4. CI runs the four shards at K = 1 and one unsharded job at K = 4 (`in-game (lanes)`). The CI lanes job has no measurement yet; the first CI run of the pull request is its measurement, and the entry drops to `lanes: "2"` if the runner cannot meet the ADR 0186 deadline.

| Run | K | Wall time | PLAN `ticks=` | SUMMARY `ticks=` | SUMMARY `ms=` | Effective TPS |
|---|---|---|---|---|---|---|
| `GAME_TEST_ALL=1`, run 1 | 4 | 91 s | 6477 | 1773 | 89091 | 19.9 |
| `GAME_TEST_ALL=1`, run 2 | 4 | 92 s | 6477 | 1779 | 89404 | 19.9 |
| `GAME_TEST_ALL=1`, run 3 | 4 | 91 s | 6477 | 1764 | 88719 | 19.9 |
| shard 1/4 | 1 | 82 s | 1618 | 1607 | 80514 | 20.0 |
| shard 2/4 | 1 | 85 s | 1620 | 1662 | 83107 | 20.0 |
| shard 3/4 | 1 | 85 s | 1619 | 1608 | 80442 | 20.0 |
| shard 4/4 | 1 | 82 s | 1620 | 1635 | 82049 | 19.9 |

All runs passed with `fail=0`, and no watchdog warning was logged. The four lanes cost about 0.1 TPS compared with a serial run, so the wall time follows the longest lane, not the sum of the scenarios. The serial suite took 7,816 ticks (about 391 s) before the series.
