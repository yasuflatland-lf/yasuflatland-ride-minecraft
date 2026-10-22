# 0094. The camper's shower-toilet door and shower

- Status: Accepted (the floor-tap trigger is superseded by [0098](0098-a-block-for-the-camper-shower-toilet.md); extended by [0105](0105-toggle-a-camper-door-once-per-swing.md) and [0114](0114-open-the-camper-wall-cabinet.md))
- Date: 2026-10-21
- Extends: 0068, 0093

## Context

0093 put a shower-toilet in the camper's rear right corner (local x -1, z -3, layers 1 and 2). It is drawn only by the model, with a `shower_door` bone, and it has no block of its own. The design (#347) asks that its door open and its shower run while the camper is parked. A long-press there reaches the room's floor block under it, which did nothing. A custom component with `onPlayerInteract` on the floor block would catch that tap, but it would also make players sneak to place a held block on the floor, as on a chest. 0093's `playerInteractWithBlock` before-event handler already sees every tap on the room. The entry door already swings by an entity property in 10 steps (0068). The camper entity had 6 properties.

## Decision

- Two new entity properties, both client-synced:
  - `yasu_ride:shower_door` (float 0 to 1) swings the `shower_door` bone up to 90 degrees into the aisle, 0.1 per tick like the entry door.
  - `yasu_ride:shower` (bool) is true while the shower runs.
  - The camper now has 8 properties. After a reload the shower door's swing is restored like the entry door's. The shower is not restored; it is off after a reload.
- The room's floor block gets no custom component, so a held block still goes onto the room floor without sneaking. Instead, 0093's `playerInteractWithBlock` before-event handler gets a second branch after its camping gear branch. It takes the first event of a tap on a camper floor block with an empty hand:
  - It does not cancel the event. An empty-hand tap on the floor does nothing in vanilla.
  - It reads the dimension, the block's cell, and the player's position, and runs `TapDockFloor` on the next tick with `system.run`, as placing decor does.
- In a parked camper, such a tap on the floor cell under the shower-toilet (local x -1, z -3, the floor layer) does one of two things:
  - If the player's position is outside that cell's block column, it opens or shuts the shower door.
  - If it is inside, it runs the shower.
  - A tap on any other floor cell, or with an item in hand, does nothing.
- Two use cases do the work and take only the vehicle, so they do not know which block was tapped: `UseShowerDoor` and `RunShower`. A third, `TapDockFloor`, is the floor's entry point. It finds the room that owns the tapped floor and asks the vehicle what the tap means. When the shower-toilet gets blocks of its own, their custom components call the same two use cases.
- The shower runs for `CAMPER_SPEC.showerTicks` (100 ticks, 5 s), and a tap while it runs starts the 100 ticks over. While `yasu_ride:shower` is true, the client does two things:
  - It emits the `yasu_ride:shower_spray` particle at the model's `shower_head` locator, under the modeled shower head, every 0.1 s.
  - It plays the `yasu_ride.shower` loop, made by `tools/gen_sounds.py`, every 1 s.
- Departure shuts the shower door at once and stops the shower, the same way it shuts the entry door.

## Consequences

- The shower door has no collision. Players walk through it, like the rest of 0093's furniture.
- The shower door and the shower answer only an empty hand. A player holding any item, a camping gear item or a block, gets that item's own behavior on the shower floor instead.
- Every first empty-hand tap on a camper floor block looks up the room that laid it. Only the shower floor cell of a parked camper does anything.
- The spray reuses the white puff on the vanilla particle sheet, tinted blue, so no texture is added.
- When the shower-toilet gets blocks of its own, move these taps to those blocks. Then remove the floor branch from the before-event handler unless something else uses it.
