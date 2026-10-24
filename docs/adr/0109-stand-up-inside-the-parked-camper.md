# 0109. Stand up inside the parked camper

- Status: Extended by [0140](0140-put-a-bulldozer-driver-out-beside-the-left-door.md)
- Date: 2026-10-22
- Extends: 0063, 0068, 0095

## Context

A parked camper keeps an invisible one-seat entity, `yasu_ride:deck_seat`, at each free seat and on the toilet (0063, 0068, 0095). When a player sitting on one presses the dismount button (touch) or sneaks (PC), the engine picks where they land: the first free spot around the deck seat. Inside the room's wall blocks that spot is outside the wall, so the player ends up outside the camper, on the side away from the door (#430). Standing up from a seat should leave the player in the room.

The script cannot choose the engine's dismount spot: the stable API has no event for a rider leaving an entity, and `minecraft:rideable` has no dismount position. It can see who rides each deck seat every tick, and it can teleport a player.

A deck seat loses its rider in other ways that must keep their current behavior:

- `DeckSeats.board()` ejects each deck-seat rider and adds them to the camper (or back to the deck seat when the camper refuses them), when the driver's deck seat rider sets off (0063, 0068)
- Departure takes refused riders off their deck seats and seats or moves them, then removes every deck seat (0068, 0095)
- A deck seat is removed when its vehicle seat gets a rider, and when the camper is gone or broken (0063)

## Decision

- A deck seat spot (`DeckSeatSpot` in `dock/dock.ts`) may name a `stand` point: where a rider who stands up from it while the vehicle stays parked is put, feet on the floor. A kind that names none keeps the engine's dismount spot. The sports boat names none (0050)
- The camper names one per deck seat, the middle of the aisle cell (local x 0) beside the seat at the floor top, 1 block above the hold pose: the driver's and passenger's seats (z 2.1) stand up into the aisle cell at z 2, just behind the front seats; the dinette seats (z 1 and -1) into the aisle cell at the same z; the toilet seat (cell x -1, z -3) into the aisle cell at z -3, in front of the shower-toilet door. These cells hold no furniture block or decor slot at layers 1 and 2, so they are open interior cells
- Every tick, after boarding and departure, `DeckSeats.keep` remembers which player rides each deck seat it keeps. On the next tick, a player who rode a deck seat that is still kept, is the same entity, and still has a `stand` point, and who now rides nothing (no `minecraft:riding` component), is teleported to that point with their rotation unchanged
- Only that case moves a player:
  - A player boarded into the camper, or onto another seat, rides something and is left alone
  - A deck seat that is removed this tick (departure, its vehicle seat taken, the camper gone) is not kept, so its former rider keeps the engine's dismount spot, as before
  - A deck seat that was replaced (a new entity) does not match the remembered one
  - The remembered riders live in script memory only. After `/reload` or a restart nobody is remembered, so the first tick moves nobody, and the player keeps the engine's spot
- The player is moved only when the feet and head cells at the stand point hold air or a light block, so a block a player put in the aisle leaves the engine's spot instead of trapping the rider inside it. A player in another dimension, no longer valid, dead, or more than 6 blocks from the deck seat is not moved: the engine's dismount spot is next to the seat, so a player that far left by `/tp`, an ender pearl or a portal and is not pulled back

## Consequences

- A player who stands up from any camper seat while it is parked stays inside, in the aisle beside their seat, facing the way they looked
- The engine still places the player first, so for one tick they may stand outside the wall before the teleport; check in a play test whether that shows as a flicker
- Standing up is detected one tick late at most, and a player who stands up in the same tick the camper departs keeps the engine's spot
- Keeping the deck seats now reads each seat's riders once more per tick (five lookups per parked camper)
- The in-game tests have no player to seat, so they check only that each stand point lands on a laid floor block with open feet and head cells; the stand-up itself is a manual test (C92 to C95)
