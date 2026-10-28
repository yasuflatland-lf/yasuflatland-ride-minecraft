# 0177. Drive text on the sports boat driver deck seat

- Status: Accepted
- Date: 2026-10-29
- Extends: [0063](0063-walk-on-a-stopped-sports-boat.md), [0095](0095-sit-on-the-camper-toilet-while-parked.md)

## Context

A docked sports boat keeps one invisible single-seat entity `yasu_ride:deck_seat` at each boat seat that has no rider (0063). Its interact button reads "Sit" (`action.interact.yasu_ride.sit`). The owner wants the driver's seat to read "Drive" (with a Japanese translation), because sitting there and pushing the stick is how the boat sets off. Passenger seats keep "Sit".

`minecraft:rideable.interact_text` is one string per rideable component, so it cannot differ per seat inside one component; this is why each held seat is its own entity. `yasu_ride:deck_seat` is shared with the parked camper, whose driver deck seat must keep "Sit". The only per-spot variation so far is `DeckSeatSpot.compact` (0095), which triggers an event that adds a component group.

## Decision

1. Only the sports boat's driver deck seat (index `DRIVER_SEAT`) reads "Drive". The camper, the SUV and the passenger deck seats keep "Sit".
2. `DeckSeatSpot` gets an optional `driver` flag. `SportsboatDrive.dockAt` sets it on the spot at `DRIVER_SEAT` only. No profile or shared code branches on the vehicle kind (0050).
3. `DeckSeats.keep` triggers the event `yasu_ride:driver` once on a newly spawned seat whose spot has `driver`, exactly like the compact event.
4. `deck_seat.se.json` gets the component group `yasu_ride:driver` with a full `minecraft:rideable` identical to the base one except `interact_text: "action.interact.yasu_ride.drive"`, and the event that adds it. The group is never removed, because removing a group that overrides a base component removes the component (0063); the seat is only ever removed.
5. The lang keys `action.interact.yasu_ride.drive` are added in en_US and ja_JP.

## Consequences

- The Resource Pack version goes up (0015), and the entity change needs a server restart, not `/reload`.
- Unverified: whether Bedrock honors a `minecraft:rideable` overridden by a component group for the interact text. Manual row B54 checks it on PC and mobile. If the button still reads "Sit", fall back to a second entity type `yasu_ride:deck_seat_driver` in a follow-up and amend this ADR; that touches every place that compares `DECK_SEAT_TYPE`.
- The afloat boat's "Ride" button is unchanged: one text serves four seats.
