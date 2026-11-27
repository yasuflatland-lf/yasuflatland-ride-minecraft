# 0254. Build Wand stairs and terrace from a row and a gaze goal

- Status: Proposed
- Acceptance condition: the stairs and terrace series is finished and its device check passes
- Date: 2026-11-21
- Extends: [0198](0198-one-build-wand-without-a-bulldozer.md)
- Related: [0233](0233-round-shapes-and-terrain-operations.md): terrain operations
- Related: [0253](0253-persistent-build-selection-and-tool-swapping.md): persistent selection

## Context

Players need stairs to join two floors indoors, to traverse a hillside, and to build a road through buried terrain. Selecting both ends by tapping was rejected: on a hill the end cell can be inside the terrain and cannot be tapped, and tapped points become stale after Rotate or a build.

## Decision

1. **Row.** Offer Stairs and Terrace as root shape-menu entries for a selected horizontal line: two tapped points at the same y that differ on exactly one horizontal axis. A single cell also qualifies when both taps match that cell and the confirmed selection is 1×1×1. The row is the foot of the staircase, and its length is the width.
2. **Material.** Use the point 1 block as the material, as for every other build. A hand-placed stair block tapped as point 1 yields real stairs.
3. **Goal projection.** [0262](0262-tap-to-place-the-build-wand-paste-box-and-stair-goal.md) Decisions 1 and 2 replace gaze targeting with a block tap and deliberate confirmation. The goal block's y is the requested goal level. Its perpendicular distance from the row sets the run, and its side of the row determines the direction. For a single-cell foot, project the goal onto the horizontal axis with the larger absolute offset, choosing x on ties. The signed offset on that axis determines the run and direction. Rise is signed and clamped to the run for a slope of at most 45 degrees. A goal below the row produces a descending staircase. A tap with zero run or zero rise leaves the current goal in place.
4. **Treads.** Positions run from 0 to the run inclusive. Position 0 is the row and is written as the first step. There are |rise| treads over positions 1 through the run. Their depths differ by at most one, with deeper treads first, nearest the row. The final position is at the goal level.
5. **Cell roles.** For a column at level `h`, let `lowY = min(rowY, goalY)` and `highY = max(rowY, goalY)`. Step cells are at `h`; below cells have `lowY < y < h`; headroom cells are at `h+1` through `h+3`; and above cells for Terrace are at `h+1` through `highY + 3`. Clamp every role to the world height.
6. **Stair materials.** For stair material, orient the nose cells of each tread, nearest the lower end, as stairs descending toward that end. Use upside-down, flat-top stairs for other tread cells and below cells. Use any other material as is.
7. **Stairs contents form.** Offer Passage, Fill below, Steps only, and Cancel. Passage writes step and below cells and clears headroom to air; it is also used indoors, where it opens the stairwell and may clear the landing above the top step. Fill below writes step and below cells. Steps only writes step cells.
8. **Terrace.** Remove above cells without placing blocks. Terrace is an ordinary undoable edit limited by `maxVolume`, not `maxTerrainSide`. Terrain above `highY + 3` remains, even if it overhangs.
9. **Refusal.** Refuse falling or unstable materials (`isFillMaterial`) for Stairs.
10. **After the edit.** Keep the goal row selected at its original width so the next segment can start at once. The goal row is the original row moved by the run in the chosen direction and placed at the goal level. Undo restores both the cells and the row selection.
11. **Leaving the flow.** Canceling or dismissing the forms returns to point 1 aiming, as roof contents do today.

## Consequences

- Long roads take several passes because the goal must be within reach.
- Passage clears up to three blocks above the landing.
- Overhangs may remain above a Terrace.
