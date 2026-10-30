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
