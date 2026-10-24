# 0143. Place the camper in the SUV's space

- Status: Proposed
- Date: 2026-10-24
- Extends: [0067](0067-camper.md), [0142](0142-place-the-bulldozer-in-the-suvs-space.md)

## Context

The owner asks that the camper can be placed in the same space as the SUV, as 0142 did for the bulldozer. 0067 asked for 9 x 9 x 4 clear cells, so that the 7.6-block body fits in every facing: at 45 degrees a rear corner reaches 3.82 blocks from the center. Any block within four cells of the clicked one therefore refused the placement. The camper's collision box is 3.0 wide and 4.0 high, which `tests/packs/placementClearance.test.ts` accepts in 3 x 3 cells and 4 cells high.

## Decision

- Set the camper's placement clearance to `halfX` 1, `halfZ` 1, and height 4, the SUV's footprint with the camper's own height. The surface stays the top face of a block.
- This supersedes the 9 x 9 clearance in 0067's Decision. Nothing else in 0067 changes.

## Consequences

A camper can be placed where the SUV can, beside a wall or a rock, but the body extends about 2.3 blocks past the cells at its ends. Those ends may stand inside nearby blocks at placement. The drive's end check (0067) stops the body only toward the blocked end, so the driver backs out the other way. The collision box is unchanged. `isVehicleSpace` (0122) still keeps another vehicle's footprint clear.
