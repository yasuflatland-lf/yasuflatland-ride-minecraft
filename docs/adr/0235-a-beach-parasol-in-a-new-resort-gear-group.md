# 0235. A beach parasol in a new Resort Gear group

- Status: Proposed
- Acceptance condition: the owner confirms in game that rain does not fall under a row of `yasu_ride:parasol_ceiling` blocks, that snow does not settle there, and that nothing blocks the way through them
- Date: 2026-11-09
- Related: [0207](0207-lay-a-rain-ceiling-over-an-occupied-roof-tent.md): the rain ceiling whose invisible block the parasol's block is modelled on
- Related: [0131](0131-pitch-a-tent-in-the-camp.md): the tent shelter blocks

## Context

The owner wants a beach parasol that can be planted next to a camp. Its canopy has to keep rain off whoever sits under it. The design is in `docs/designs/2026-11-09-beach-parasol-design.md`. The tent already keeps rain off with the invisible `tent_ceiling` block, which has a 3-pixel collision box (0207). A parasol canopy is above head height, so a collision box there could still catch a jumping player or a vehicle.

The author could not watch weather in the game when this block was written. Whether a block with no collision box stops rain is therefore not measured yet.

## Decision

- Add a Resort Gear group of items for resort-style camp gear, implemented in a new `resort` feature, with the parasol as its first member.
- Build the parasol as a cantilever: one pole beside the seat, with the canopy reaching over it. Its size, the placement rule (the canopy's center goes on the tapped position, and the base about three blocks behind it), painting, pick-up, the first hand-out, and the recipe follow the design document.
- Keep the rain off with a new invisible block, `yasu_ride:parasol_ceiling`, laid under the canopy. Take option A: `minecraft:collision_box` is `false`. The block draws nothing (`bone_visibility` hides the cube, as for `tent_ceiling`), has no selection box, does not dampen light, emits none, cannot be mined or blown up, and carries the `yasu_ride:laid` tag.
- Rain behaviour is to be confirmed in game by the owner. If rain still falls under the block, fall back to option B: the same block with a collision box at origin `[-8, 0, -8]`, size `[16, 3, 16]`, as `tent_ceiling` has. A new ADR records that change.

## Consequences

Nothing collides with the parasol's rain ceiling, so a canopy cannot trap a jump or a vehicle. The risk is that the engine counts only blocks with a collision box as covering a column; the acceptance condition is exactly that check. Until it passes, this ADR stays Proposed. Option B would put a thin invisible plate above head height, where the canopy already is.
