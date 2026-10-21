# 0072. Keep motion/ behind the kinds

- Status: Accepted
- Date: 2026-10-20
- Extends: 0055, 0065

## Context

0055 made `src/domain/vehicle/motion/` the movement building blocks that kinds pick from, and set the import rules around them: the core cannot import `motion/`, and application and infrastructure import kinds only through `kinds/index.ts`. 0065 enforces these rules with dependency-cruiser (`pnpm lint:deps`). Nothing stops application or infrastructure from importing `motion/` directly, which would tie an outer layer to a building block that only some kinds use and bypass the kind that owns it. No application or infrastructure file imports `motion/` today. `src/test-pack/` imports `motion/dock` and `motion/forms`, but it sits outside the layers and is excluded from the rules (0065).

## Decision

Add the dependency-cruiser rule `outer-layer-imports-motion` to `.dependency-cruiser.cjs`: no module under `src/application/` or `src/infrastructure/` may import a module under `src/domain/vehicle/motion/`. Type-only imports count, as for every rule (0065). `kinds/index.ts` belongs to the kinds and may import and re-export from `motion/`; that is the sanctioned way to hand a motion value to an outer layer, not a loophole. `tests/architecture.test.ts` self-tests the rule with two fixtures that must fail (one application, one infrastructure) and two that must pass (a kind importing `motion/`, and `kinds/index.ts` importing `motion/`).

## Consequences

An outer layer that needs a motion value gets it through `kinds/index.ts` or a core type, so a kind can change which building blocks it uses without touching application or infrastructure. To expose a motion type to an outer layer, either move it into the core or re-export it from `kinds/index.ts`. `src/test-pack/` is unaffected and may keep importing `motion/` directly.
