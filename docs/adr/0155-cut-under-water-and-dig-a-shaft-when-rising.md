# 0155. Cut under water and dig a wide shaft when rising

- Status: Proposed
- Date: 2026-10-26
- Extends: [0137](0137-clear-block-columns-with-the-blade.md) (the column cut and its keep list), [0138](0138-raise-and-lower-the-bulldozer-blade.md) (the blade cuts only while fully lowered)
- Supersedes in part: [0136](0136-bulldozer.md) (its rule that the submarine form does not cut)

## Context

The owner wants the bulldozer to keep cutting rock and obstacles under the sea without cutting the water, and to dig upward when it rises while shut in by obstacles. Today a submarine bulldozer cuts nothing (0136), and a rising body only meets what the forward blade strip happens to remove: the strip lies 1.0 to 2.9 blocks ahead, so a roof above the body stays and a hole only one block wide traps the 3.35-block footprint.

## Decision

- **Cut under water.** `cutReach` returns `"tunnel"` for the submarine form, the same fixed body-height strip that takeoff, hover, and landing cut. The conditions are unchanged: a driver, no pivot, speed above `blade.minSpeed`, and the blade fully lowered (0138). Water, flowing water, lava, and the rest of `CUT_KEPT_BLOCKS` stay (0137), so the cut removes only solid blocks. Whether water flows into the air cells it leaves is the game's neighbor update, not this code's.
- **Dig a shaft when rising.** While the blade is fully lowered and a driver is present, in takeoff, or in hover or submarine form with a positive climb input (`climbInput`), the drive probes the `BULLDOZER_SPEC.shaft.reach` = 2 cells that start at the cell holding the body's top (`floor(y + carHeight)`) over the footprint (`footprint` = 3.35 blocks, axis-aligned). If `TickContext.solidAt` finds any solid block there, the drive adds the shaft to `DriveStep.cut`: those same 2 cells over a square that reaches `footprint / 2 + BULLDOZER_SPEC.shaft.margin` blocks from the body's center, with `margin` = 2 on each of north, east, south, and west. The box follows the compass, not the yaw. It is cut every tick the probe finds an obstacle, so the hole follows the climb; it adds no per-vehicle state. The forward strip and the shaft are concatenated into one cut list.
- **Enclosed means blocked.** "Surrounded by obstacles" is read as a solid block over the footprint within the probe reach. Open water and open air probe empty, so no shaft is cut and the cost stays at one probe of at most 16 columns by 2 cells per rising tick. A kept block (a container, a laid add-on block) over the footprint still triggers the probe and stays in place, so a roof made only of kept blocks leaves a wide, repeated, but empty cut.
- Keep the two tuning values in `BULLDOZER_SPEC.shaft`, not shared with other kinds (0050). The cut uses the existing adapter, so it keeps 0137's fill cap, chunk checks, and drop sweep. Cuts run in every game mode.

## Consequences

A shaft of up to 10 by 10 columns can be cut per tick, each column one `fillBlocks` of 2 cells, only on ticks that rise under a roof. Measure it on the dev BDS if it shows in tick time; reduce `margin` first if so. A bulldozer hovering still below a roof with Jump held keeps cutting the same cells until the roof is gone. The submarine tunnel can leave a dry air pocket in rock if the game does not flood it; the manual checks B25 and B26 cover this and the in-game tests do not yet. Accept this ADR with 0136 after those checks pass on PC and mobile.
