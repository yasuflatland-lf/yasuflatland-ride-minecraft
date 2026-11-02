# 0200. Roof tent as a host-bound camp entity

- Status: Proposed
- Acceptance condition: the roof tent checks in docs/manual-test.md pass on PC and mobile
- Date: 2026-11-02
- Extends: [0129](0129-share-room-primitives-between-features.md): host-state port next to SpaceCheck
- Extends: [0130](0130-a-tent-entity-whose-hits-land-on-its-blocks.md): separate roof tent entity
- Extends: [0131](0131-pitch-a-tent-in-the-camp.md): host-bound placement and removal
- Extends: [0135](0135-repaint-the-tent-with-dyes.md): roof tent paint follows the shared palette
- Extends: [0050](0050-vehicle-kinds-and-per-kind-profiles.md): per-kind roof tent mount

## Context

The ground tent builds a room from world-aligned blocks and claims its entire
footprint. A roof tent must instead fit a vehicle's roof, keep its identity across
reloads, and stop sheltering its occupant before the vehicle departs. Camp cannot
import vehicle domain objects under the feature boundary of 0129. The SUV and
camper also have different roofs and entrance positions, so shared camp logic
cannot assume either vehicle's dimensions.

## Decision

- The roof tent is a separate camp entity, not the block-built ground tent of
  0130 and 0131. It does not lay the ground tent's room blocks. Its host marker is
  `vehicle:<id>` in the shared camp host codec; the full suffix is the vehicle ID,
  including any colons or newlines. Unknown or malformed markers decode as ground.
- Each supported kind supplies a `RoofTentMount` through `VehicleProfile.roofTent`.
  The contract lives in `src/domain/shared/roofTent.ts`: roof height, vehicle-local
  anchor, ladder requirement, and entrance foot point. Absence of a mount means
  the kind does not support a roof tent. Camp never branches on vehicle kind.
- Features exchange host state through `VehicleHostLookup` next to `SpaceCheck`.
  The port in `src/application/shared/ports/vehicleHost.ts` is a pure read wired
  through bootstrap; it reports presence, location, yaw, mount, driver presence,
  and motion without exposing a vehicle aggregate. This extends 0129's space-only
  boundary with a shared host-state port.
- Deployment requires a supported, present, stationary host without a seated
  driver, and an unoccupied roof mount. Placement uses the host's quarter-turn
  facing and its per-kind mount rather than ground tent cells.
- A host check removes the roof tent when the host is positively removed, a driver
  is seated, or the host is moving. Unknown presence, including an unloaded host,
  keeps the tent until the host can be checked. Ordinary tabletop item guards skip
  vehicle hosts; roof tent removal uses this host rule.
- Removal first ejects an occupant to safe ground beside the vehicle, never onto
  the roof or into the vehicle. Removing the roof tent clears its sleeper's spawn
  point through `BedWorld.clearSpawnPoint`, so a later respawn cannot target a
  vanished roof shelter. That port operation and engine integration arrive with
  the roof tent sleep lifecycle.
- One immutable occupancy value tracks a single player. Entry fails while occupied;
  leaving by another player has no effect. Three hits within 100 ticks fold the
  tent. Host checks run every 4 ticks, faster than ordinary hosted gear checks.
- Roof tent paint follows the shared palette and dye behavior of 0135, with its
  own entity and assets.

## Consequences

Camp owns the roof tent lifecycle while vehicles supply only mount data and a
shared host-state query. Adding a supported kind requires profile data rather
than a kind-specific camp branch. Unknown host state preserves saved shelters
across unloaded chunks, but removal waits until presence is known.

The domain rules can be tested without Bedrock. Entity assets, application actions,
occupant ejection, spawn clearing, paint, and PC/mobile acceptance require later
integration work. The ADR remains Proposed until the roof tent manual checks pass
on both input types. Revisit the host port if another feature needs state beyond
this snapshot; do not pass live vehicle objects across the boundary.
