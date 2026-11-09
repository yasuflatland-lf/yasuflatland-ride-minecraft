# 0235. Share convex rain ceiling geometry and placement

- Status: Proposed
- Acceptance condition: shared ceiling extraction is reviewed and roof tent regression checks pass
- Date: 2026-11-09
- Extends: [0207](0207-lay-a-rain-ceiling-over-an-occupied-roof-tent.md): reusable geometry and block placement

## Context

A beach parasol needs an octagonal rain ceiling. The roof tent already provides
rectangular coverage and conservative block placement, but both belong to camp.
The shared components must preserve the roof tent's behavior.

## Decision

Use a factory-created, immutable `Footprint` in domain shared code. Rectangle and
regular octagon factories guarantee counterclockwise convex corners; a private
brand prevents callers from supplying arbitrary polygons. Local x points left and
local z points ahead. `footprintColumns` uses polygon edge normals and world x/z
axes to test overlap with unit block columns, including touching boundaries.
The roof tent keeps its variant dimensions and ridge-height rule in a thin wrapper.

Move placement, clearing, and saved-cell parsing and writing to shared
`RainCeilingLayer`. Configure the block ID, vehicle-space check, and warning label.
Keep existing records, place only in air outside vehicle space, and clear only
recorded blocks whose type still matches. An optional shared warning callback
keeps failures in block operations and the caller's persistence step within one
warning per operation. Camp retains snapshots, dynamic properties, and ownership.

## Consequences

Other shelters can reuse rain coverage without importing camp. There are no pack
changes or roof tent behavior changes. Property tests compare the refactored roof
tent geometry to a preserved legacy implementation and check octagon geometry,
coverage, and bounds. The existing roof tent adapter tests remain unchanged.
