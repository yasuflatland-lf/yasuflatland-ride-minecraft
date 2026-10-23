# 0090. Group the vehicle core by subcontext

- Status: Accepted (extended by [0129](0129-share-room-primitives-between-features.md): syncedValue.ts left the vehicle core for shared)
- Date: 2026-10-21
- Extends: 0055

## Context

0055 kept the kind-neutral core flat in `src/domain/vehicle`: the aggregate, seats, ram, hit counter, headlights, placement, fleet, paint, input, and the contracts in `drive.ts`. Since then, the dock and floor (0063, 0064, 0068) and the per-player and per-kind fleet limits (0066) went into the same folder. At commit 5d2d8d6 it held 20 files, and later changes added small driving helpers such as `syncedValue.ts`. Driving, fleet, lighting, paint, placement, and dock code sat side by side, and nothing in the tree showed which file belonged to which context.

The dependency-cruiser rule that keeps the core away from `motion/` (0055, 0065) matched only files directly in `src/domain/vehicle/` (`^src/domain/vehicle/[^/]+$`). A core file in a subfolder could have imported `motion/` without failing `pnpm lint:deps`.

## Decision

- Keep the driving core flat in `src/domain/vehicle/`: the aggregate, its drive contract and input, seats, ram, the hit counter, the profile, `SPEC`, the entity contract, events, `kind.ts`, the vehicle repository, and the driving helpers added after 0055 (`cooldowns.ts`, `hints.ts`, `seating.ts`, `syncedValue.ts`)
- Move the other contexts into subfolders of the core:
  - `fleet/`: `fleet.ts` and `fleetRepository.ts`
  - `lighting/`: `headlights.ts`
  - `paint/`: `paint.ts`
  - `placement/`: `placement.ts`
  - `dock/`: `dock.ts` and `floor.ts`
- Every file under `src/domain/vehicle/` outside `kinds/` and `motion/` is core. The rules of 0055 apply to all of them: the core never imports `kinds/` or `motion/`. `core-imports-motion` matches `^src/domain/vehicle/` with `pathNot` `^src/domain/vehicle/(?:kinds|motion)/`
- Subfolders of the core may import each other and the flat core files. No rule separates them; they are folders for reading, not features (0046)
- No barrel `index.ts` in the new subfolders; importers name the file
- `tests/` mirrors the moves: a test of a moved file moves to the matching subfolder under `tests/domain/vehicle/`
- A new core file goes into the subfolder of its context, or stays flat when it belongs to driving

## Consequences

- The tree shows the contexts. Application and infrastructure imports name the context in their path, for example `domain/vehicle/fleet/fleet`
- `Cell` and `cellKey` stay in `lighting/headlights.ts`, so `dock/` imports `lighting/`. Moving the block grid types to a file of their own is left for a later change
- The application ports in `src/application/vehicle/ports.ts` still mix the contexts; splitting them is a separate change
- Revisit when a subfolder needs its own import rules, for example if `fleet/` must not depend on driving
