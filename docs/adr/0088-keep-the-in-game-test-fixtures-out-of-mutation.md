# 0088. Keep the in-game test fixtures out of mutation testing

- Status: Accepted
- Date: 2026-10-20
- Extends: 0048 (the files Stryker does not mutate)

## Context

0048 mutates everything in `src/` except `src/main.ts` and `src/test-pack/runner.ts`, which only wire up `@minecraft/server`. That module exists only inside the game, so no unit test can import those files or kill their mutants (0010).

`runner.ts` had grown to about 1,900 lines. The in-game test arena and its fixtures (spawning a vehicle, the pool, the boat) now live in `src/test-pack/arena.ts`, and checks shared by the SUV and camper scenarios live in `src/test-pack/scenarios/`. They call `@minecraft/server` just as `runner.ts` does. Mutated, every one of their mutants would count as uncovered and pull the score toward the break threshold, although nothing about the tests changed.

`src/test-pack/protocol.ts` and `src/test-pack/ramJudge.ts` are pure and have unit tests in `tests/test-pack/`.

## Decision

- Besides `src/main.ts` and `src/test-pack/runner.ts`, Stryker does not mutate `src/test-pack/arena.ts` or any file under `src/test-pack/scenarios/`. `stryker.config.mjs` lists them as `!src/test-pack/arena.ts` and `!src/test-pack/scenarios/**/*.ts`
- Every other file in `src/`, including `src/test-pack/protocol.ts` and `src/test-pack/ramJudge.ts`, stays mutated
- A new file in the test pack that calls `@minecraft/server` goes under `src/test-pack/scenarios/` or is added to the list. Pure logic in the test pack goes in its own file with unit tests, as `protocol.ts` and `ramJudge.ts` do

## Consequences

- The mutation score keeps measuring only code that unit tests can reach
- The in-game tests (`pnpm test:game`) stay the only check on the arena, the fixtures and the scenarios
- A pure helper placed under `src/test-pack/scenarios/` would escape mutation testing, so keep pure logic out of that folder
