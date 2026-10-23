# 0131. Pitch a tent in the camp

- Status: Proposed (to be Accepted once the manual checks under Tent in [manual-test.md](../manual-test.md) pass)
- Date: 2026-10-23
- Extends: [0130](0130-a-tent-entity-whose-hits-land-on-its-blocks.md) (the tent's cells, entity, and hit surfaces), [0129](0129-share-room-primitives-between-features.md) (camp space checked by the vehicles), [0122](0122-a-low-chair-to-sit-on-outside-the-vehicles.md) (the camp feature and three hits), 0068 (clearing passable decorations and the hidden hit box), 0101 (invisible blocks), 0116 (hit boxes fixed from spawn)

## Context

0130 fixed the tent's cell layout, its entity, and the rule that its hits land on its
own blocks, but nothing could pitch it. This decision records how the item pitches a
tent, how its invisible wall and ceiling cells turn it into a shelter, and how three
hits take it back into its item.

The engine limits of 0068, 0084, and 0116 still decide the hit design: a
`minecraft:custom_hit_test` changed after spawn never reaches the client, hit box
pivots never turn with yaw, a block cannot be placed inside an entity's collision box,
and a tiny box inside a full block cannot be tapped. The stable API (0001) has no
`Block.isSolid`.

## Decision

### Pose and cells

The tent faces the player who pitches it. `tentPose(clicked, playerYaw)` puts local
`(0, 0, layer 0)` on the cell above the clicked block and snaps the yaw to
`normalizeYaw(round((playerYaw + 180) / 90) * 90)`. Local cells are `{ x, depth, layer }`:
`x` toward the tent's left, as `leftOf(forward(yaw))`; `depth` behind the tarp's
front edge, 0..11 (`depth = 11 - z` in 0130's frame); `layer` 0 resting on the ground.
The entity stands at the bottom middle of local `(0, 11, 0)`, the rear wall's middle cell.

`tentCells(pose)` lays 137 cells:

| Part | Cells | Count |
|---|---|---|
| Front wall | depth 3, x -2..2, layers 0..2, plate toward the front room | 15 |
| Side walls | x 3 and x -3, depth 4..10, layers 0..2, plates toward x 0 | 42 |
| Inner wall | depth 8, x -2..2, layers 0..2, plate toward the front room | 15 |
| Rear wall | depth 11, x -2..2, layers 0..2, plate toward the bedroom | 15 |
| Room ceiling | layer 3, x -2..2, depth 4..10 | 35 |
| Tarp ceiling | layer 2, x -2..2, depth 0..2 | 15 |

That is 87 `yasu_ride:tent_wall` cells and 50 `yasu_ride:tent_ceiling` cells. The
flap cells of 0130 are laid as closed walls until 10/13; the mattress cells stay air
until 11/13. The wall's `yasu_ride:face` state uses the camper's face numbers, and its
2 px plate has equal collision and selection boxes, so hits from outside reach it.
The ceiling is a 3 px plate at the bottom of its cell, so the headroom is exactly 3
in the rooms and 2 under the tarp. Both blocks use the hidden cube of 0101 and are
indestructible.

### Pitching

`PitchTent` surveys, plans, and lays in one call on the tick after the press, so the
check and the lay see the same world. `planPitch` refuses for the first rule that fails,
in this order, and the item is kept:

1. `limit`: the world already holds 4 tents, in all dimensions together.
2. `vehicle`: any of the 336 clear cells (x -3..3, depth 0..11, layers 0..3) is vehicle
   space. Every layer is asked, because the clear rule reads a camper's light-block
   cells as air and would miss a dock cell above the ground.
3. `crowded`: a player or another entity with health (a mob, a Low Chair) meets the footprint box.
4. `blocked`: a clear cell is unreadable, or neither air (a light block reads as air)
   nor a passable decoration from the shared list of 0068 and 0119. This catches a step.
5. `ground`: a ground cell under the 84 columns is unreadable, air, liquid, or a passable
   decoration. This catches a hole. A slab or another block that is not full still
   counts as ground, since the stable API has no `isSolid`.

On success the item is taken (not in Creative), the decorations are cleared top first
without drops, and the entity is spawned, registered, and its cells laid. A failed
spawn gives the item back.

### Registry and camp space

The world dynamic property `yasu_ride:tents` holds the pitched tents as
`[{"id","dimensionId","pose":{"x","y","z","yaw"}}]`, read lazily on first use. Each
tent's laid cells are saved on its entity as `yasu_ride:tent_cells`, through the shared
`CellLayer` of 0096. Both shapes are fixed from this decision; later PRs may add
`TentBlock` members but must still read them.

`isCampSpace` answers from the registry: every clear cell of a registered tent is camp
space, so the vehicles refuse it (0129) even before the tent is loaded. The laid-block
owner falls back to the registry the same way, so a hit or a Creative break right
after `/reload` or a restart still finds its tent.

The loop lays every registered tent whose entity is loaded, and its live set for
`clearGone` is the registry, not the loaded entities: a tent whose entity chunk unloads
keeps its cells in a neighbor chunk that stays loaded. Only tents taken down or killed
in a loaded chunk (0125) leave the registry, and a tent entity the registry does not
know is removed as an orphan when it loads.

### Hits

Hits count on the tent's own blocks, which are world-aligned at all four yaws, and on
the entity's 0.1 hidden box at the bottom of the rear wall's middle cell. No stand-in
entity is needed, unlike the camper (0116). From inside, the rear wall's plate is in
front of the box, so taps inside reach blocks. No hit counts while a player's feet are
inside the tent (both rooms with their walls; not the tarp area or the roof); the hitter
sees "Someone is inside the tent" instead.

`entityHitBlock`, a Creative `playerBreakBlock` (whose break the shared guard of 0096
cancels), and `entityHitEntity` share one per-player, per-tick set, so one swing counts
once even when both block events fire. A held press on a phone counts every swing the
engine reports. Three hits within 100 ticks from outside return the item and take the
tent down: its cells that still hold its blocks are cleared, so a block a player put
in its place stays.

### Shelter

The ceiling's `light_emission` is 4 (`TENT_SPEC.ceilingLight`): three layers below it the
block light is still 1, so no hostile mob spawns inside. The value is tuned in game.
Camping gear such as the oil lamp cannot be placed in the tent: no tent block has a
decor slot, and the gear placement path is unchanged.

## Consequences

The tent can be pitched, sheltered in, and taken down. The Low Chair can stand on the
tent's floor, which is camp space and not vehicle space, but not on its walls or
ceilings, which are this add-on's blocks. Rain and snow must stop at the invisible
ceiling, and no mob may spawn inside through a night; both are manual checks, as are
the swing count of a held press on a phone and the ceiling light value. Revisit the
ground rule if a stable `isSolid` arrives.
