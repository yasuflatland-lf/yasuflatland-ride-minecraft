# 0222. Split the DriveWorld port by role

- Status: Accepted
- Date: 2026-11-04
- Extends: [0012](0012-ddd-layered-architecture.md): vehicle drive port composition
- Related: [0221](0221-organize-infrastructure-vehicle-code-by-kind.md): shared vehicle adapters

## Context

The vehicle drive port combines loaded snapshots, surroundings, motion, block changes, riders and rider effects. Its Bedrock implementation also answers dock ownership and vehicle space queries. Keeping these responsibilities in one adapter makes changes harder to review; issue #1306 requests a behavior-preserving split.

## Decision

- Define `LoadedVehicleWorld`, `SurroundingsWorld`, `ImpulseWorld`, `VehicleBlockWorld`, `RiderWorld` and `RiderEffectWorld` in the application drive port. Keep `DriveWorld` as their intersection and export only roles imported by a consumer or adapter.
- Keep `DriveVehicles` on `DriveWorld` and narrow `RiderEffects` to `RiderEffectWorld`.
- Implement each role in its own Bedrock class, with dock ownership and vehicle space queries in a seventh class. Keep each role file below 300 lines.
- Keep `BedrockVehicleWorld` as the composing adapter with its existing constructor, public methods and `releaser`. Construct shared state once and inject the same instances into the roles. Preserve side-effect order, cleanup and the public dock ownership query used by vehicle space checks.

## Consequences

Role implementations can be read independently, at the cost of explicit forwarding methods and constructor dependencies. Existing tests continue to exercise the composing adapter. Revisit role boundaries when a consumer needs a different subset; this split changes no game behavior.
