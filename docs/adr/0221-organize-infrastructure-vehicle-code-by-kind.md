# 0221. Organize infrastructure vehicle code by kind

- Status: Accepted
- Date: 2026-11-04
- Extends: [0055](0055-kind-neutral-vehicle-core.md): infrastructure kind folders
- Related: [0046](0046-organize-each-layer-by-feature.md): feature boundaries and installation
- Related: [0065](0065-check-import-rules-with-dependency-cruiser.md): import enforcement

## Context

The vehicle infrastructure mixes camper room blocks, decor, interaction handlers and identifiers with the shared adapters. The domain already separates kinds (0055), but its original layout decision gives infrastructure no per-kind folders. Moving the camper code requires removing the core's direct dependencies on its room implementation without changing registration order or persistence.

## Decision

- Put kind-specific infrastructure in `src/infrastructure/vehicle/kinds/<kind>/`. Move the camper's dock blocks, face-height handling, room handlers and room-only identifiers into `kinds/camper/`. Keep shared identifiers and records keyed by shared unions in the core.
- Make `src/infrastructure/vehicle/install.ts` the only core file that imports and wires infrastructure kinds. Inject kind behavior into core adapters through core-declared interfaces and predicates. `DockLayer` declares ownership, laying, cleanup and saved-state operations; the camper's `DockBlocks` implements it. Pass the standable-room predicate through the world adapter and deck seats to stand-up placement.
- Register camper handlers through `installCamper`. Call it from the subscriptions callback, with a guard-registration callback between dock door and shower-toilet registration, preserving the existing event subscription order.
- Enforce `infrastructure-core-imports-kind` and `infrastructure-kind-imports-other-kind` through `lint:deps`. Core files outside `kinds/` cannot import kinds except for the vehicle's root `install.ts`. Kind folders may import the core but cannot import another kind folder.
- Preserve all behavior, identifiers, saved data and impact-selection tags. Tests mirror the moved files and exercise the injected wiring and import boundaries.

## Consequences

Camper-only engine integration is identifiable by its folder, and core adapters depend on contracts they declare. New kind integration is wired in one place. Constructor parameters and installation callbacks increase, and registration order must remain explicit when adding handlers. Revisit shared implementations if another kind needs the same integration.
