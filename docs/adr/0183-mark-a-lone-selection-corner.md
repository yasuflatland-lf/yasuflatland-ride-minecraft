# 0183. Mark a lone selection corner

- Status: Proposed
- Acceptance condition: owner decision pending (see #1193)
- Date: 2026-10-29
- Extends: [0178](0178-bulldozer-build-tools-in-a-separate-namespace.md): the bulldozer build tools and their selection

## Context

0178 sets pos1 with the first hit of a block and pos2 by using the wand on a block. The selection draws its outline only when both corners exist, because `selectionBox` returns nothing until then. After the first corner and before the second, the player sees only the action bar message and nothing in the world. On a long build the first corner is easy to lose.

0178 does not say what the player sees in that state. The paste preview of 0178 Decision 7 is the only outline it records.

WorldEdit-BE, which 0178 names as the model for the behavior, has the same gap for its selection wand. It draws a first-corner marker only for its generator tools, with particles at the eight corners of the block, every five ticks.

## Decision

1. With only a start cell, the start marker blinks on alternate redraw intervals measured from the server tick. Immediate redraws use the same phase. With a live or fixed endpoint, every redraw shows both endpoint markers alongside the selection outline. If both endpoints occupy the same cell, every redraw shows one shared marker there.
2. Each marker traces the cell's unit cube grown by `BUILD_SPEC.markerOutset` past each face, because points exactly on the faces of a ground-level block are hidden by the terrain. Draw its eight corners first, then the interior points of the eight horizontal edges, then the four vertical edge midpoints. Each horizontal edge has `BUILD_SPEC.markerHorizontalEdgeSteps` equal intervals. Sixteen intervals place fifteen interior points per edge, giving 132 distinct points per cube.
3. Endpoint markers use one custom Resource Pack particle, `yasu_build:marker`. It draws a `lookat_direction` billboard using a custom direction from Molang `variable.direction` and a length from `variable.length`, extended by the width to close the corners. Its starting width is 0.06 blocks. It uses its own generated 16x16 solid white texture so each tint reaches full brightness at night. The script supplies white (1, 1, 1) for the start, red (1, 0.35, 0.35) for the end, and orange (1, 0.7, 0.2) for a shared cell so the player can distinguish the three roles from each other and from the selection and paste outlines. The particle uses alpha blending to preserve the tint in daylight and lasts 0.6 seconds to cover the 10-tick redraw interval. Outlines use `yasu_build:outline`, a size 0.3 particle on the vanilla texture sheet (three times the original marker size of 0.1), so they stay visible on a small screen. An entity wireframe was rejected: it would be visible to every player without per-player property overrides, could intercept taps on the start block and the end cell's `tap_target`, and would need spawn, move, removal, startup sweep, and structure exclusion handling. Client interpolation could make the live end marker slide, and the entity might cast a shadow. Its only gains are closed corners and no linger. The particle requires a Resource Pack version bump and a matching Behavior Pack dependency update when changed (0015).
4. Only the owner of the selection sees the marker, spawned through `player.spawnParticle`, and only in the dimension the corner was set in. It is redrawn on the same interval as the selection outline, `BUILD_SPEC.outlineInterval`.
5. `selectionBox` keeps its meaning: it returns a box only when both corners exist. Fill, replace, copy, and the other edits still report no selection with one corner. The marker reads `pos1` and `pos2` directly instead of widening that function.
6. The point list for a unit cube and the preview model are pure functions in the domain layer with property-based tests. The preview model takes the marker dimension from `dimensionOf(flow)`, with the viewer dimension as a fallback. The particle call stays in `src/infrastructure/build`, behind the `BuildFeedback` port, which gains one operation for a single corner.

## Consequences

A player can see where the first corner is while looking for the second. A visible lone or shared marker costs 36 particles. Two distinct endpoints cost 72 particles per redraw. These particles are separate from the selection outline's 512-point budget.

The script can tune endpoint colors through the stable `MolangVariableMap` API. Changes to the particle itself require a Resource Pack version bump (0015). Daylight visibility needs a check on PC and iPad.

Stepping through two corners now has three visible states: no corner, a lone corner, and a selection. A future change to the selection model, such as a third corner or another shape, has to decide what a lone corner of that model looks like.
