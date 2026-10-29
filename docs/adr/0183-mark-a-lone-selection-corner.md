# 0183. Mark a lone selection corner

- Status: Proposed
- Date: 2026-10-29
- Extends: [0178](0178-bulldozer-build-tools-in-a-separate-namespace.md) (the bulldozer build tools and their selection)

## Context

0178 sets pos1 with the first hit of a block and pos2 by using the wand on a block. The selection draws its outline only when both corners exist, because `selectionBox` returns nothing until then. After the first corner and before the second, the player sees only the action bar message and nothing in the world. On a long build the first corner is easy to lose.

0178 does not say what the player sees in that state. The paste preview of 0178 Decision 7 is the only outline it records.

WorldEdit-BE, which 0178 names as the model for the behavior, has the same gap for its selection wand. It draws a first-corner marker only for its generator tools, with particles at the eight corners of the block, every five ticks.

## Decision

1. While a selection holds exactly one corner, whether pos1 or pos2, the build mode outline shows that corner. Nothing changes once both corners exist: the selection outline of 0178 is drawn and the marker is not.
2. The marker is the outline of the corner's unit cube: its eight corners and the midpoint of each of its twelve edges, twenty particles in all. The points sit on the block's boundary, so the marker surrounds the block instead of sitting in its middle.
3. The marker uses `minecraft:endrod`, a particle that neither the selection outline (`minecraft:villager_happy`) nor the paste outline (`minecraft:blue_flame_particle`) uses, so the player can tell a lone corner from a selection at a glance. It is a stock particle; no Resource Pack change is needed.
4. Only the owner of the selection sees the marker, spawned through `player.spawnParticle`, and only in the dimension the corner was set in. It is redrawn on the same interval as the selection outline, `BUILD_SPEC.outlineInterval`.
5. `selectionBox` keeps its meaning: it returns a box only when both corners exist. Fill, replace, copy, and the other edits still report no selection with one corner. The marker reads `pos1` and `pos2` directly instead of widening that function.
6. The point list for a unit cube is a pure function in the domain layer, with property-based tests. The particle call stays in `src/infrastructure/build`, behind the `BuildFeedback` port, which gains one operation for a single corner.

## Consequences

A player can see where the first corner is while looking for the second. The cost is twenty more particles per redraw for each player who holds a lone corner, well under the 512-point cap of a selection outline.

The marker particle is a stock one chosen by looks, not measured. Revisit the choice if it is hard to see in daylight or on mobile, in which case a Resource Pack particle would need a manifest version bump (0015).

Stepping through two corners now has three visible states: no corner, a lone corner, and a selection. A future change to the selection model, such as a third corner or another shape, has to decide what a lone corner of that model looks like.
