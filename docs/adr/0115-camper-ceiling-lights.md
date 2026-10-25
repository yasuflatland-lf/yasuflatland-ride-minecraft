# 0115. Ceiling lights in the parked camper

- Status: Accepted (extended by [0123](0123-a-fridge-in-place-of-the-camper-shelf.md): the open fridge top door's plate takes the front light's cell and gives its light; and by [0134](0134-switch-the-tent-lantern-with-the-headlight-switch.md): the same switch turns a tent's lantern on and off from inside the tent); extended by [0147](0147-light-the-lamps-with-a-pbr-emissive-layer.md) (Proposed); superseded in part by [0149](0149-route-the-parked-camper-wheel-seat-to-headlights.md) (the wheel deck seat's switch target)
- Date: 2026-10-22
- Extends: 0020 (the headlight switch and light blocks), 0024 (the switch cooldown), 0068 (the parked room's cells), 0096 (lost cells are laid again)

## Context

The parked camper's room is dark at night. The owner wants two ceiling lights over the aisle, one toward the front and one toward the rear of the room, like the dome lights of a real camper (#445). Agreed with the owner:

- While the camper is parked, any player inside the room switches the ceiling lights on or off with the existing headlight switch item. They need not sit in the driver's seat
- A driver at the wheel keeps using the switch for the headlights, exactly as today
- The lights brighten the room, and their panels look lit while they are on
- One touch flips them once, with the headlight switch's cooldown

Facts this builds on:

- Only a light block lights the world with the stable API, and the scripts treat `minecraft:light_block_*` as air (0020). The dock lays a parked camper's room cells through `DockBlocks`, which places only into air or a light block, saves what it laid, and once a second lays again any laid cell whose block the world lost, counting a light block as lost (0096)
- In the aisle (local x 0), the cells of layer 2, right under the ceiling layer, hold no furniture, decor slot, plate or seat: the dashboard fills z 3, the open wall cabinet doors stand in the ceiling layer at z -1 and -2 (0114), and the deck seats' riders stand up into layer 1 (0109). Those cells are cargo cells, read only on departure, where a light block reads as air
- The headlights glow through the `headlights` bone, whose material the render controller switches between `entity` and `entity_emissive` (0020). The camper has 12 entity properties of the 32 the engine allows
- A seated player in a parked camper rides either the camper itself (the riders who were aboard when it parked keep their vehicle seats) or a deck seat (0063). Only the camper's seat 0 rider is the driver; the deck seat at the wheel does not switch the headlights today

## Decision

- **Who switches what.** A use of the headlight switch by the rider of a vehicle goes to the headlights first. When the vehicle refuses it because the rider is not its driver, or because of its cooldown, the use goes to the ceiling lights of that vehicle, which refuse the driver. A player who rides no vehicle, whether on foot or on a deck seat, switches the ceiling lights of the room they are in. So in a parked camper, the camper's seat 0 rider still switches the headlights, and everyone else in the room, including a player on the deck seat at the wheel, switches the ceiling lights. The headlights behave exactly as before
- **Finding the room.** The room is the vehicle that laid the block under the player's feet, or the cell of their feet. The camper drive then switches only while parked, and only for feet inside the box where it looks for standing players on departure (`insideRoom`, 0.5 to 3.5 blocks above the pose over the interior), so a player on the roof cannot switch them
- **Events.** The switch is handled on `itemUse` and on an interaction with the vehicle as in 0020, and also on an interaction with the camper whose room the player stands in. In the small room a press mostly lands on a wall, the floor or the ceiling, so `world.beforeEvents.playerInteractWithBlock` with the switch in hand counts as a use too, for a player who rides no vehicle and stands in a room. That press is cancelled, so the switch never also opens a door or the cabinet. A rider's block presses are left as they were. Before cancelling, the handler asks the read-only query `SwitchCeilingLights.canSwitch` (the vehicle's `canSwitchCeilingLights`, backed by the drive's `ceilingLightsReachable`: parked and `insideRoom`, ignoring the cooldown). A dock-laid cell also lies under a player on a boat or SUV deck (0063), on the camper roof, or at its exit, and there the press goes through untouched
- **Cooldown.** The vehicle keeps a second `SwitchCooldown` for the ceiling lights with `SPEC.headlightSwitchCooldown`, shared by every player in the room. Each use restarts the idle time, as in 0024. It is separate from the headlights' cooldown, so the driver and a passenger never block each other
- **Light.** While the lights are on, the parked camper's dock adds a cell of the new dock block type `light` (`minecraft:light_block_15`) in the aisle cell of layer 2 under each light: `CEILING_LIGHTS` in `kinds/camper/furniture.ts`, local z 1 (between the front seats and the dinette) and z -3 (in front of the shower-toilet door). They are laid and cleared with the room's cells, so they go when the lights go off, when the camper departs, and when it is broken (the dock clears a gone vehicle's cells, 0038). A player's block in such a cell keeps its place; the light is laid there only once it is air again
- **Lost lights.** On the once-a-second check of 0096, a cell where the dock laid a light counts as lost only when it holds air or another light block, so the dock does not lay its own lights again every second
- **State.** The new entity property `yasu_ride:ceiling_lights` (bool, default `false`, `client_sync`) holds whether they are on. It is in the camper contract's `restored` list and is restored only when the camper was docked, as the doors are, so the lights survive `/reload` and a restart while parked. Departing turns them off, and the next park starts dark. Each switch plays `random.click` at the camper, as the headlights do
- **Look.** `tools/gen_camper.py` hangs a light under the ceiling liner over each light cell: a 9 x 9 px chrome rim 0.4 px deep and an 8 x 8 px lens 0.8 px deep below it, in the new bone `ceiling_lights`, a child of `body`. The lenses use the new last palette swatch `dome`, whose alpha is 0 in every paint. The render controller gives the bone `Material.lamp` (`entity`, which ignores alpha) while the property is off and `Material.lamp_lit` (`entity_emissive`, alpha 0 is fully lit) while it is on. The opaque rim stays unlit under either material

## Consequences

- The room can be lit at night from anywhere inside it, and a passenger no longer has to ask the driver
- The camper has 13 of its 32 entity properties, and `ceiling_lights` joins the camper's bone names
- A press on a block with the switch in hand never interacts with that block while the player stands inside a parked camper's room, even when the press reaches the switch's cooldown and flips nothing. Elsewhere, including a vehicle deck and the camper roof, the switch in hand changes no press
- The deck seat at the wheel switches the ceiling lights, not the headlights. Revisit if players expect the headlights there; that would change the headlights' rule of 0019 and 0020
- A light block in a cell where a player stands is invisible and has no collision. A player holding a light block sees it, and a Creative player's break of it is cancelled like any laid block's (0096)
- The in-game tests cannot use an item without a player, so the switch is covered by unit tests and the manual test; whether the room is bright enough, and whether a press on each kind of room block reaches the switch on PC and on mobile, must be checked in game
