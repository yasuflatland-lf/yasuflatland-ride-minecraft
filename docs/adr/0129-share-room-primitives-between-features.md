# 0129. Share room primitives between features

- Status: Accepted (extended by [0134](0134-switch-the-tent-lantern-with-the-headlight-switch.md): the tent lantern is a second target of the switch router)
- Date: 2026-10-23
- Extends: [0046](0046-organize-each-layer-by-feature.md), [0122](0122-a-low-chair-to-sit-on-outside-the-vehicles.md)

## Context

The tent needs the room-block layer, the bed, the paint palette, the switch router and the tap toggle that the camper already has. Every folder under a layer other than `shared` counts as a feature (`tests/architecture.test.ts`), so there is no neutral room feature. Copying about 500 lines of workarounds, including the lost-cell recheck (0096), lights counted as air (0115) and the Creative break guard, would let the two copies drift apart. The tent cannot be a vehicle kind because it must stay out of the fleet and the ram query (0122).

Two risks need explicit boundaries. A light block counts as air for vehicle placement and room laying, so vehicles could overwrite a tent's spawn guards. A single shared owner registry would make tent cells vehicle space, which would block chairs on the tent floor.

## Decision

- `shared/` holds kind-neutral primitives and parameterized engines only. These are `domain/shared/cells.ts`, `laidCells.ts` (`relayCells`), `sleep.ts`, `paint.ts`, `switchCooldown.ts` and `tapToggle.ts`/`syncedValue.ts`; `application/shared/sleepInBed.ts`, `repaint.ts` and `ports/`; and `infrastructure/shared/identifiers.ts` (`AIR_BLOCK`, `messageKey`, `HEADLIGHT_SWITCH_TYPE`), `lightBlocks.ts`, `laidCells.ts` (`CellLayer`), `laidBlockGuard.ts`, `bedrockBedWorld.ts`, `dyes.ts` (later also `PAINT_VARIANT` and `paintEvent`) and `switchRouter.ts`. A feature's block union (`DockBlock`, later `TentBlock`), block ids, saved property keys and policies (camper doors swinging together, headlight driver rules, `PaintVehicle`) stay in the feature.
- Each feature keeps its own owner registry, a `CellLayer` instance per feature: `DockBlocks` for vehicles, and `tentBlocks.ts` for camp from 9/13 of the tent stack.
- Features see each other's space only as a `SpaceCheck` passed through `bootstrap.ts`, in both directions. Bootstrap installs vehicles first with a check that reads a late-bound camp reference, then assigns that reference to the result of installing camp. Vehicle placement, room laying and headlights refuse camp space. Room laying keeps cells the vehicle already owns if a later camp answer claims them. Camp placement (the chair now, the tent later) refuses vehicle space. The low chair claims no space.
- `PAINTS` order is the saved `minecraft:variant` of every painted entity, the tent included, so its order never changes.

## Consequences

Camp space is asked once per clearance cell when placing a vehicle, and once per wanted room or headlight cell on every lay, which runs each tick. Room laying reads the cells the vehicle holds, from memory or from the saved property after a /reload, only when camp claims a wanted cell, so a held cell stays laid across a /reload too. Before `installCamp` returns, the check answers false, which is safe because no event or tick runs until bootstrap returns. Camp claims no space until the tent is implemented, so existing vehicle and chair behavior stays the same.

A third feature adds one more edge in bootstrap. Revisit if a feature needs another feature's live objects rather than a yes/no space check.
