# 0175. Keep the icebreaker cut above the hull floor

- Status: Proposed
- Date: 2026-10-29
- Supersedes in part: [0171](0171-sports-boat-equipment-and-icebreaker-mode.md) (Decision 7: the three-block downward margin), [0051](0051-sports-boat.md) (the rule that the script never pushes the hull vertically)
- Extends: [0080](0080-beached-boat-coasts-to-a-stop.md), [0155](0155-dock-the-sports-boat-on-the-water-surface.md)

## Context

The owner reported that with a big mountain ahead the boat goes down under the water. The cause traced from the code:

1. `icebreakerColumns` cut from three rows below the hull floor up. Every solid cell in those rows became air, including the shore or mountain foot under the water.
2. The boat moves up to 1.12 blocks per tick while water spreads about one cell per 5 ticks (0155), so the boat reaches freshly cut cells before they flood. Over dry air it is beached and gravity pulls it down the pit.
3. The pit then floods from above, leaving the hull below the surface. The existing in-game test never showed this because its wall stands in a flat pool and the cut never leaves the pool.

The in-game scenarios `boat_icebreaker_mountain_on` and `_off` record the per-tick height, water depth and feet block as the trace for this. The measured drop on the old cut was not re-run on main before the fix; the scenario now guards the new behavior.

## Decision

1. **Cut from the hull floor row.** The cut covers rows from `hullFloorRow(feetY) = floor(feetY + floorEpsilon)` up to `ceil(feetY + height + margin)`. Nothing below the hull floor row is removed, so the bed under and around the hull stays. The rectangle is unchanged.
2. **Level tunnel, not a ramp.** The icebreaker digs a tunnel at hull height. Climbing over would need forward drive while the hull is out of the water, which 0051 and 0080 forbid on purpose and which would need a new beached-driving mode.
3. **Surfacing lift.** While afloat and the water over the feet is deeper than `surfacing.maxDepth`, in either mode, the script adds an upward impulse `surfaceLift(depth)`, capped at `maxLift` and continuous at the threshold. A trench can flood a hull after the mode was switched off. Beached, docked and held steps keep a zero vertical impulse; the engine owns buoyancy and gravity otherwise.
4. **Mode OFF** cuts nothing; the wall stops the boat.
5. **Dry channel head.** When the hull row ahead is dry the boat is beached, stops, and cannot drive forward or cut (0171 rule 6). When water floods the cell it is afloat again. Reverse always works (0080).

## Consequences

The channel is only as long as the water reaches, about 7 blocks from the water. Past that the boat rests on the solid row below it and can reverse out. Placing water to extend the channel is out of scope because it adds terrain and can flood caves; revisit it if owners want longer tunnels.

The worst fall onto the bed is under one block. No Resource Pack file changes.
