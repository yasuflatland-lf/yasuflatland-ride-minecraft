# 0097. Press the camper furniture to place decor

- Status: Accepted
- Date: 2026-10-21
- Supersedes in part: [0093](0093-decorate-the-parked-camper.md): the press on a model-only top, the per-item places, and the cargo check of decor slot cells
- Extends: [0068](0068-park-the-camper-with-room-blocks.md)

## Context

0093 places decor from `world.beforeEvents.playerInteractWithBlock`, which fires only when the press hits a block of the parked room. The furniture that holds decor (dashboard, table, dinette seats, shelf, stove, counter, wall cabinet, ceiling hook) is drawn only by the camper model, and 0093 assumed that a long-press on such a top reaches the floor block under it. The v0.12.0 play test (#393) showed that it often does not: the walls and the deck floor have no selection box (0068), so a press aimed at a stove or counter from a seat or across the aisle passes through the room and hits the ground outside. The handler sees a vanilla block and does nothing, so the player gets no item placed and no message.

The walls keep no selection box on purpose: with one, a wall would take every press aimed through it.

The play test also showed two more problems:

- Each item fits only the furniture listed in its places (0093), so most presses on a free spot were refused, and players could not tell why an item went somewhere else or nowhere.
- A deck seat entity (`yasu_ride:deck_seat`) stands on each dinette seat (0068). A press there hits the entity first and seats the player, so nothing could be placed on a dinette seat.

## Decision

### The furniture block

- The room lays `yasu_ride:camper_furniture` in every decor slot cell that holds no decor. A slot cell holds either this block or the slot's decor block, never both and never neither while the room is laid
- The block draws nothing (`geometry.yasu_ride.deck_floor`, like the other room blocks), has no collision, cannot be broken by mining or explosions, and has no custom component. Its state `yasu_ride:height` (0 to 15) is the slot's height in pixels. For a height h from 1 to 15 the selection box covers the whole cell from its bottom up to h px, the furniture top. For height 0, the hanging ceiling hook, it covers x and z -4 to 4 px and y 6 to 16 px, where the hanging item is. The box is narrower than the cell because a standing player's eyes are about 10 px into the hook's layer, and a full-width box there would catch presses aimed down at the table top under the hook
- The dock block is `{ type: "furniture", height }`. It is one of the camper's room blocks wherever room blocks are recognized

### Choosing the slot

- Pressing a furniture block or a decor block while holding camping gear first tries the slot of the pressed cell: when that slot accepts the item and is free, the item goes there. Otherwise the nearest free accepting slot to the hit point is used, as in 0093. This replaces 0093's "a long-press on a model-only top reaches the floor block under it; the nearest-slot rule then picks the slot on top"
- Per-item places are gone. An item either stands or hangs (`hanging` in `tools/camping_gear.json`). Standing slots accept standing gear, with an optional `DecorSlot.items` allowlist when the surface cannot safely hold every item. `slotsFor` reads that data and the hanging flag without branching on vehicle kind. The dashboard uses `DASHBOARD_SLOT_ITEMS`, derived from the deterministic output of `python3 -I tools/camper_decor_fit.py --json`: 15 centre fits and 8 left fits on the current models. It checks full shelf support, conservative footprint rectangles, and the transformed box against the windshield, gauges, column, lever and all other camper cubes. The hanging planter fits only `ceiling_hook`. "No free spot for this item" shows only when every accepting slot is taken. Saved items that violate the new clearance restriction move to a free accepting slot or are stowed, preserving the item.

- The block geometry of each item stays within 0 to 16 px of its cell; the slot height is applied by the decor block's `minecraft:transformation` per `yasu_ride:height` state, as in 0093

### Pressing a dinette deck seat

- `world.beforeEvents.playerInteractWithEntity` also places decor. When the held item is camping gear and the target is a `yasu_ride:deck_seat`, the handler looks for a slot cell in the seat's column: the seat's own cell and the two above it, the first that holds the furniture block or a decor block. When a parked vehicle laid that cell, the event is cancelled, so the player does not sit, and on the next tick decor is placed with that cell as the pressed cell and the seat's location as the hit point
- The entity event has no `isFirstEvent`, and a held touch repeats it on later ticks (every 4 to 6 ticks on mobile, 0024). A seat press counts only after that player's seat presses have been idle for `CAMPER_SPEC.seatPressIdleTicks` (10 ticks), and every press restarts the idle time, as the headlight switch does (0024). One long-press places one item; two taps need half a second between them
- With an empty hand or any other item the player sits as before. The front deck seats and the toilet's deck seat have no slot in their column, so nothing changes for them. The headlight switch, which uses the same event on the vehicle entity, is not camping gear, so the two handlers never act on the same press

### Departure

- Slot cells are no longer cargo cells. On departure the slot cells are read in the same batch as the cargo and exit cells. A slot cell lets the camper leave while it holds air, the furniture block, or the decor block of the item in that slot. Anything else asks the driver to clear it, as cargo does
- The walls keep no selection box

## Consequences

- A press on an empty decor spot from anywhere inside, including a seat, reaches the camper, and a press on a spot that cannot take the item still gets an item placed elsewhere or the "No free spot for this item" message
- An occupied spot holds only its decor block, whose selection box is the item's own footprint. A press on the item reaches the camper; a press on the rest of an occupied stove, counter, or table top passes through as before. The decor box is not widened to the furniture top: `minecraft:transformation` moves the box up with the item, so it would have to start below its cell, and an empty-hand press anywhere on the top would then take the item back
- Standing items can go on any standing spot whose clearance allowlist accepts them; a cushion can still stand on the stove, but cannot stand on the shallow dashboard shelf. The owner chose this over per-item places, which refused most presses in the play test
- The departure check reads 49 cargo cells, 12 slot cells, and 2 exit cells: still 63 cells in one batch
- A vanilla block held while pressing a furniture top is placed in the cell next to the pressed face, inside the room, where before it went outside. That block is cargo and keeps the camper parked until it is removed
- The furniture tops now stop presses that used to pass through them. Check on a phone and on PC that the dinette's deck seats still take a long-press to sit, and that the table top under the ceiling hook can still be pressed from the aisle. If the hook box catches presses aimed at the table, make it smaller. With gear in hand this cannot be seen, because the hook refuses a standing item and the nearest free slot is the table; an empty-hand press on an item on the table shows it, since the furniture block takes no empty-hand press and the item would not come back
- Furniture without a slot (the dashboard's right cell, the bed, the shower-toilet) gets no furniture block
- The new block needs a server restart (0015). The Resource Pack does not change: the block reuses the `deck_floor` geometry and the `glass` texture
