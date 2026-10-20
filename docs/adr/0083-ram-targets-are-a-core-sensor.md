# 0083. Ram targets are a core-only sensor

- Status: Accepted
- Date: 2026-10-20
- Supersedes in part: 0055 (targets() in TickContext)

## Context

0055 split the vehicle into a kind-neutral core and a `Drive` per kind. `Drive.step` gets only the sensors, and 0055 listed `TickContext` as `{ tick, location, velocity: Vec3, onGround, solidAt(offset), waterAt(offset), targets() }`. Later ADRs added more sensors to it, but `targets()` stayed as 0055 wrote it. `targets()` returns the entities near the vehicle that the ram may hit (0006). Only the core's `Vehicle.ram` calls it: no kind drive (SUV, camper, sports boat, or the shared transforming drive) does, yet every drive receives it and every drive test has to stub it. The riders and the test input already stay with the core in `VehicleTickInput`; the ram query is the same kind of input.

## Decision

- `TickContext` no longer has `targets()`. `VehicleTickInput` declares `targets(): readonly RamTarget[]`, still lazy and still called only when the speed exceeds `SPEC.ramMinSpeed`
- `Vehicle.tick` removes `riders`, `testInput`, and `targets` from its input before it calls `Drive.step`, and passes `targets` to the ram step itself
- A kind that needs nearby entities for its own movement asks for a new, kind-specific sensor in a new ADR instead of reading the ram query
- This replaces the part of 0055's Drive contract that lists `targets()` in `TickContext`; the rest of 0055 stands

## Consequences

- Drives and their tests no longer see or stub the ram query; only tests that call `Vehicle.tick` provide it
- `DriveVehicles` keeps building the query from `targetsNear`, so the application and infrastructure layers do not change
- No behaviour change: the query runs on the same ticks and the same hits follow
