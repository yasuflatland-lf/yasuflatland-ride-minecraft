# 0130. A tent entity whose hits land on its blocks

- Status: Proposed
- Date: 2026-10-23
- Extends: [0122](0122-a-low-chair-to-sit-on-outside-the-vehicles.md) (camp and the Camping Gear group), [0009](0009-vehicle-model-conventions.md) (front at -z)

## Context

This decision fixes the content contract for a two-room tunnel tent before pitching, shelter,
flaps, sleep, lantern interaction, and paint arrive in 9/13 through 13/13. The camp feature
uses the shared primitives and two-way space checks of 0129. The tent is
not a vehicle or camping decor, and the gear box continues to contain only its existing gear.

Hit tests changed after spawn do not reach the client (0068), and their pivots do not
rotate with entity yaw (0116). Covering all four tent headings with stand-in entities would
add lifecycle and axis selection while intercepting taps intended for blocks inside.
The entity must therefore have its tiny hit surface fixed from spawn and let future
laid blocks carry the accessible wall, ceiling, and flap surfaces.

## Decision

### Cell layout

Local cells use the camper's convention (`src/domain/vehicle/kinds/camper/room.ts`):

- `x` = left, `z` = forward (toward the tent's front).
- `layer` 0 = the air cell resting on the ground.
- The origin `(0, 0, 0)` is **the entity's own cell**, the middle of the rear wall.
- For 9/13's frame mapping, `depth = 11 - z` (depth 0 is the front row z 11, depth 11 the rear row z 0).

The model frame follows ADR 0009 (front at -z) and the game frame (+x is the entity's left, as `mirror_x` in `tools/gen_camper.py` documents). So model px = `(16 * x, 16 * layer, -16 * z)`, a cell spans +-8 px around its center, and model y 0 is the ground's top.

Footprint: 7 wide x 12 deep, `x -3..3`, `z 0..11`.

| Part | Cells |
|---|---|
| Rear wall | x -2..2, z 0, layers 0..2. The entity stands in (0, 0, 0) |
| Side walls | x -3 and x 3, z 1..7, layers 0..2, including the side flap cells |
| Bedroom | x -2..2, z 1..2, layers 0..2 |
| Mattresses | `mattress_0` x 1, z 1..2; `mattress_1` x -1, z 1..2; layer 0, 9 px high (as `camper_bed`, ADR 0092) |
| Inner tent front panel | x -2..2, z 3, layers 0..2; the bedroom flap (D-door) at x 0, layers 0..1 |
| Front room | x -2..2, z 4..7, layers 0..2 (3 blocks of headroom) |
| Side flaps | left x 3, z 5, layers 0..1; right x -3, z 5, layers 0..1 |
| Front wall | x -2..2, z 8, layers 0..2; the front flap at x 0, layers 0..1 |
| Corners | x -3 and x 3 at z 0 and at z 8 are not laid; the fly model covers them |
| Lantern cell | x 0, z 4, layer 3: the ceiling cell above the lantern. 12/13 lays a `tent_lantern` block there in place of `tent_ceiling` |
| Ceiling | x -2..2, z 1..7, layer 3 (bedroom and front room); x -2..2, z 9..11, layer 2 (tarp) |
| Tarp area | x -2..2, z 9..11, layers 0..1 open; two poles at the front corners, model only, no cell |

Counts that 9/13 must match:

- Laid wall cells: 87 (rear 15, front 15, sides 42, inner front panel 15), 8 of them flap cells (front 2, left 2, right 2, bedroom 2).
- Laid ceiling cells: 50 (35 at layer 3, 15 over the tarp at layer 2). The lantern cell is one of the 35.
- Laid cells in all: 137.
- Clear cells (the space checked before pitching): x -3..3, z 0..11, layers 0..3, 336 cells.
- Ground cells under the footprint: 84.

9/13 lays exactly these cells (`tentCells(pose)`), and `TENT_SPEC.width` / `TENT_SPEC.depth` must be 7 / 12. This content change does not add `TENT_SPEC` or any `src/domain` code.

### Entity and hit surface

The summonable, non-spawnable `yasu_ride:tent` uses entity format 1.21.80. Its five
client-synced properties are float `yasu_ride:flap_front`, `flap_left`, `flap_right`,
and `flap_bedroom` (range 0..1, default 0), and boolean `yasu_ride:lantern` (default false).

Exactly ten base components define it:

- `minecraft:type_family`: `["yasu_ride_tent", "inanimate"]`; no vehicle family (0006).
- `minecraft:variant`: value 0, reserved for 13/13 paint.
- `minecraft:collision_box`: width 0.2, height 0.2.
- `minecraft:custom_hit_test`: one width-0.1, height-0.1 box at pivot `[0, 0.05, 0]`.
- `minecraft:physics`: collision and gravity both false.
- `minecraft:pushable`: pushable and pushable by piston both false.
- `minecraft:knockback_resistance`: value 1.
- `minecraft:health`: value and max 20.
- `minecraft:damage_sensor`: all causes deal no damage.
- `minecraft:persistent`: empty object.

There is no rideable, interact, component group, event, or script behavior. Both boxes
sit at the bottom of the entity's own rear-wall cell (0,0,0). In 9/13 the room-side
2 px `tent_wall` plate shields them from inside taps. The collision box occupies
an already-laid cell, like the camper's box inside its floor (0116).

Outside hits on the entity use `world.afterEvents.entityHitEntity`. Hits on the tent's
own `tent_wall`, `tent_ceiling`, and closed `tent_flap` blocks use stable
`world.afterEvents.entityHitBlock` (the pack pins `@minecraft/server` 2.2.0).
The camp's separate `CellLayer<TentId, TentBlock>` resolves the owner. Creative
breaks must be cancelled in the before-break event with `registerLaidBlockGuard`
in `src/infrastructure/shared/laidBlockGuard.ts`, which the vehicle dock guard
(`src/infrastructure/vehicle/bedrock/handlers/dockGuard.ts`) already uses. An after-event
cannot cancel a break. 9/13 implements these paths; 13/13 uses the block-hit path
for dyes too. No stand-ins are needed at any of the four yaws, and taps inside
continue to reach blocks.

### Model, bones, and texture

`tools/gen_tent.py` writes `geometry.yasu_ride.tent` (format 1.12.0) and its 16 x 16
RGBA texture of 4 x 4 swatches. The model has no brand logo or product name (0009).
Visible bounds are width 13, height 5, offset `[0, 2.5, -5.5]`. All bones except
root have parents; `lantern_glass` is last for rendering.

| Bone | Parent | Pivot | Content and limits (px) |
|---|---|---|---|
| `root` | - | [0, 0, 0] | no cubes |
| `fly` | root | [0, 0, 0] | The outer fly. Its cross-section's inner surface is vertical at \|x\| = 52 for y 0..32, then a half ellipse centered (0, 32) with half-width 52 and height 39 (peak inner 71, outer 72); thickness 1 px outward. The tunnel runs z -135..+8 with end panels at z +7..+8 (rear) and z -135..-134 (front). Openings are cut for the front flap (x -8..8, y 0..32) and the side flaps (z -88..-72, y 0..32). The tarp is a 1 px sheet over x -41..41 from y 60 at z -135 down to y 40 at z -184. Built from z-rotated segments, as the camper wheel rim is. |
| `inner` | root | [0, 0, 0] | The white inner tent: side walls at x 40..41 and -41..-40, rear wall z -8..-7, roof y 48..50 over x -41..41, z -55..-7, front panel z -55..-54 over x -41..41, y 0..48, with the D-door opening x -8..8, y 0..32. |
| `poles` | root | [0, 0, 0] | Three 1.5 px arch poles along the fly's inner surface at z -134..-132.5, -58..-56.5, and +4..+5.5. Two tarp poles from y 0 to 40 at x 40..41.5 and -41.5..-40, z -184..-182.5. |
| `strap` | root | [0, 0, 0] | Black strap x -1..1, y 69..70, z -134..+4, with silver 2 px rings every 24 px along it. |
| `lantern` | root | [0, 69, -64] | White hook x -0.5..0.5 from y 69 down to 44 at z -64, plus a cap at y 44..45. |
| `lantern_glass` | lantern | [0, 40, -64] | Round milky shade inside x -4..4, y 36..44, z -68..-60. |
| `flap_front` | fly | [0, 32, -135.5] | Panel inside x -8..8, y 0..32, z -136..-135. |
| `flap_left` | fly | [53.5, 32, -80] | Panel inside x 53..54, y 0..32, z -88..-72. |
| `flap_right` | fly | [-53.5, 32, -80] | Panel inside x -54..-53, y 0..32, z -88..-72. |
| `flap_bedroom` | inner | [0, 32, -55.5] | D-door panel inside x -8..8, y 0..32, z -56..-55. |
| `mattress_0` | root | [16, 0, -24] | Mattress inside x 9..23, y 0..9, z -39..-9; top at 9. |
| `mattress_1` | root | [-16, 0, -24] | Mattress inside x -23..-9, y 0..9, z -39..-9; top at 9. |

Each flap pivot is the middle of its opening's top edge on the panel's plane, so scaling y rolls the flap up. The side flap opening z -88..-72 is cell z 5 (center -80, +-8 px).

The generator validates every rotated cube corner before writing, within x -56..56,
y 0..72, z -184..8. No cube may overlap the open front room (x -40..40, y 0..48,
z -120..-56), bedroom (x -40..40, y 0..48, z -40..-8), or tarp (x -40..40,
y 0..32, z -184..-136). Touching faces is allowed. Mattresses may occupy the
bedroom; the hook and shade may occupy the front room only in x -8..8,
y 32..69, z -72..-56. The shade must remain within that column's y 32..48
portion, below the layer-3 lantern cell. Flaps stay in their specified openings.
The generator also validates texture-slot ownership. Its isolated CLI imports no
other tool and `--check` compares parsed JSON and decoded PNG pixels.

| Slot | Name | RGBA |
|---|---|---|
| 0 | `fly` | (176, 140, 98, 255), the tan-brown default |
| 1 | `fly_dark` | (136, 104, 68, 255), seams and bindings |
| 2 | `inner` | (236, 234, 226, 255) |
| 3 | `inner_shade` | (204, 202, 194, 255) |
| 4 | `pole` | (170, 174, 180, 255) |
| 5 | `pole_dark` | (120, 124, 130, 255) |
| 6 | `strap` | (24, 24, 24, 255) |
| 7 | `ring` | (196, 198, 202, 255) |
| 8 | `hook` | (240, 240, 236, 255) |
| 9 | `glass` | (226, 222, 206, 0). Alpha 0: the emissive material lights it fully, and `entity` ignores alpha, as the camper's ceiling light lenses (ADR 0115). |
| 10 | `mattress` | (64, 86, 120, 255) |
| 11 | `mattress_edge` | (44, 60, 86, 255) |

Slot ownership (part of the contract): slots 0 and 1 (`fly`, `fly_dark`) are used only by cubes of `fly`, `flap_front`, `flap_left`, and `flap_right` (the fly group). `flap_bedroom` uses slots 2 and 3. No other bone uses slots 0 and 1. So 13/13's recolor of slots 0 and 1 repaints exactly the fly and its three flaps.

The client uses opaque `entity` for the default and unlit lamp materials, and
`entity_emissive` when the lantern property is true (0115). Only `lantern_glass`
switches materials via `Array.lamps`. The four looping flap animations scale
only their own bone's y by `1 - 0.875 * q.property('yasu_ride:flap_<name>')`,
rolling an open flap to the top 4 px. 10/13 changes properties, not these animations.

### Item and recipe

`yasu_ride:tent_item` stacks to one and closes the Camping Gear creative group,
after the Low Chair. Its 128 px preview and 32 px icon are generated from the
entity model. English names read Tent; Japanese locale names use katakana.

The always-unlocked crafting-table shaped recipe is `[" W ", "WSW", "T T"]`,
with W the `minecraft:wool` tag, S a stick, and T string, producing one tent.
This pattern consumes three wool, one stick, and two string. Any wool color fits
through the tag. The dev BDS content log showed no error for the recipe or the
other tent files when this ADR was proposed (2026-10-23), so the
`minecraft:white_wool` fallback was not needed.

Resource Pack header and module versions and the Behavior Pack dependency move
from 0.1.104 to 0.1.106 (0015). Entity and Resource Pack changes need a restart.

## Consequences

The item can be obtained and the entity summoned, but using the item does nothing
yet. 9/13 records pitching and shelter in its own ADR extending this one.
The fixed cell, bone, property, and palette contracts allow 9/13 through 13/13 to
add behavior without changing this layout. Vehicle, chair, and camping decor
assets remain unchanged.

Pack tests cover the entity, client, geometry, material slots, item, catalog,
recipe, and locales. The registered `tent_entity_contract` scenario checks no
gravity, both families, default properties and variant, damage immunity, and item
construction, removing the entity in finally. Before accepting this ADR, check
the model orientation, item icon, and crafting recipe on a client.
