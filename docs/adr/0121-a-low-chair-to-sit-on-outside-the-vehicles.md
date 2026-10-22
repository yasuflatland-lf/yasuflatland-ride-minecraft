# 0121. A low chair to sit on outside the vehicles

- Status: Proposed (to be Accepted once the in-game checks under Consequences pass)
- Date: 2026-10-22
- Extends: 0008 (placing from an item and taking back with three hits), 0046 (feature folders), 0093 (the Camping Gear group)

## Context

Issue #464 asks for camping gear that stands outside the car: a low folding aluminium camp chair, like the four reference photos, that seats the player when they press "Sit".

1. Everything the add-on placed in the world until now was either a vehicle or decor inside a parked camper (0093). The chair is neither. It is not driven, so it does not belong to the `vehicle` feature, which holds every driven entity (0046). Decor lives in the camper's furniture slots and is not an entity a player can sit on.
2. Placing the chair must not land it inside a vehicle or a parked camper's room. The vehicle feature knows where its vehicles stand and which cells its room blocks fill (0068, 0093), but a second feature cannot import it (0046).
3. On touch screens a short tap on an entity is an attack and a long press is the interaction (0036). A rule that took the chair back on one hit would fold it up whenever a player tapped it to sit.
4. Seats on the deck seat entity (0063) already use `minecraft:rideable` with the `action.interact.yasu_ride.sit` text ("Sit", already translated), which gives mobile players a Sit button.

## Decision

- **A new `camp` feature.** The chair gets `src/domain/camp`, `src/application/camp`, and `src/infrastructure/camp`, with its own `installCamp()`. `installVehicles()` returns `isVehicleSpace(dimensionId, cell)`, and `bootstrap.ts` hands it to `installCamp()`, so only the composition root knows both features. `tests/architecture.test.ts` keeps an example of this wiring.
- **Shared helpers move to `shared/`.** The hit counter moves to `src/domain/shared/hitCounter.ts` and takes its rule (`hits`, `resetTicks`) from the caller; the vehicles pass `SPEC.hitsToBreak` and `SPEC.hitResetTicks`. `consumeHeld`, `giveOrDrop`, and `isCreative` move to `src/infrastructure/shared/players.ts`.
- **The entity.** `yasu_ride:low_chair` (`low_chair.se.json`) is summonable but never spawns on its own. Its families are `yasu_ride_low_chair` and `inanimate`, so vehicle rams skip it (0006). It has a 0.75 x 1.0 collision box, no gravity and no collision physics, cannot be pushed, takes no damage from any cause, is persistent, and has no behaviors, movement, or despawn component. `minecraft:rideable` seats one player at `[0, 0.14, 0.1]` with the interact text `action.interact.yasu_ride.sit` and `crouching_skip_interact`. The seat height puts the player 0.24 below the sling's top (6 px), as the camper's front cushion top sits about 0.24 above its seat.
- **Placing it.** The item `yasu_ride:low_chair_item` (stacks to 16) follows the vehicle pattern on land (0008, 0024): `beforeEvents.playerInteractWithBlock`, the first event only, once per player per tick, then `system.run` with the hotbar slot. Only the top face of a block places it. The chair stands on that block, `(x + 0.5, y + 1, z + 0.5)`, turned to face the player: the player's yaw plus 180 degrees, snapped to 45 degrees (`CHAIR_SPEC.yawStep`). It is refused, leaving the item unconsumed, in this order:
  - the clicked block is one of this add-on's blocks (a camper's room blocks), or the cell above it is vehicle space;
  - the two blocks above the clicked one (`CHAIR_SPEC.clearance`) are not both air, so a seated player's head fits;
  - a chair already stands in that cell;
  - outside Creative, the slot no longer holds the item.

  A click on our blocks or in vehicle space is not cancelled, so a camper's doors and other blocks still work with the chair in hand.
- **Vehicle space.** A cell is vehicle space when a vehicle laid a room block in it or in the block under it (`dockCellOwner`), or when a loaded vehicle stands so near that the cell lies inside its kind's placement clearance turned to any heading: the cell is at most `max(halfX, halfZ)` blocks from the vehicle's cell on x and on z, and 0 to `height` blocks above it.
- **Taking it back.** Three hits within 100 ticks of each other (`CHAIR_SPEC.hitsToTakeBack`, `CHAIR_SPEC.hitResetTicks`) while nobody sits on it fold the chair: it drops one chair item where it stood and disappears, as a vehicle drops its item (0008). Hits while someone sits are not counted. Each hit that does not fold it shows `yasu_ride.hint.low_chair_hits` ("Hit %s more to fold up the Low Chair") on the action bar. The scriptevent `yasu_ride:test_chair_hit <entity id>`, accepted only from the Server source, hits a chair without a player for in-game tests.
- **Staying out of the vehicles' way.** The chair's hits are handled only for `yasu_ride:low_chair`, and the vehicles' handlers only take vehicle and stand-in types. Hints, the fleet, and the drive loop query the vehicle family. The chair is not listed in `tools/camping_gear.json`, so it is never a decor item and the camping gear box does not hold it.
- **Getting one.** The Camping Gear creative group lists the chair item after the gear. Survival players craft it on a crafting table from the shaped recipe `"L  "`, `"SLS"`, `"I I"` (L leather, S stick, I iron ingot), since the gear box, the only other source of camping gear, does not hold it.
- **Model.** `tools/gen_low_chair.py` writes `geometry.yasu_ride.low_chair` and its 16 x 16 texture of 4 x 4 swatches; `pnpm model` runs it and `pnpm model:check` checks it. The model, front at -z (0009), is about 12 px wide: rubber feet, four aluminium legs up to wooden armrests that stick 1 px past the front legs, side rails and cross bars under a brown canvas sling with a darker front binding and seam, a canvas back with darker bindings reclined 12 degrees toward +z on two uprights, an X brace between the front legs below the seat, and a larger X brace across the back legs. The generator keeps it within x +-6.5, y 0..17, and z +-8 px, and checks that the back leans back. `render_preview.py` draws its 128 px preview (`docs/images/items/camping-gear/low_chair.png`) and its 32 px item icon the same way as the gear's.
- The Resource Pack moves to 0.1.100, and the Behavior Pack's dependency on it with it (0015).

## Consequences

- Players can set chairs around a parked camper, sit on them, and fold them back up with three hits, the same count as a vehicle.
- The camp feature can grow more outdoor gear with the same pattern; anything it needs from the vehicles comes through bootstrap.
- The chair stands at full-block height on a slab or another partial block, so it floats above it.
- The chair does not turn its collision box; at 0.75 wide it fits inside the block whichever way it faces.
- A chair placed before a camper parks next to it may end up inside the camper's room; parking does not check for chairs, and the chair keeps its cell. Placing is refused only in the other order.
- The in-game test `low_chair_seat_and_take_back` summons a chair, checks its one seat and family, hits it once and checks it stays, then hits it twice more and expects it gone and one chair item dropped.
- Check in game before this ADR is Accepted: the seat height (0.14) and depth (0.1) look right with a player seated, on PC and on a phone; the mobile Sit button appears on a long press; a placed chair faces the player; placement is refused on a camper's floor and next to a parked SUV; and a short tap on the chair from a phone counts as a hit, not a sit.
