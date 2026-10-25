# 0149. Route the parked camper's wheel seat to the headlights

- Status: Accepted
- Date: 2026-10-26
- Supersedes in part: [0115](0115-camper-ceiling-lights.md) (the wheel deck seat's switch target)

## Context

0115 sends the headlight switch to a vehicle's headlights only when the player rides the vehicle itself as its driver. A parked camper also has a deck seat at the wheel. A player sitting there rides the deck seat entity, so the switch router treats them as a room occupant and turns the ceiling lights on or off. The driver cannot operate the parked camper's headlights from that seat.

## Decision

- The wheel deck seat, index 0 in the camper's saved deck seat list, counts as the driver seat for the headlight switch while the camper is parked. The vehicle records that seat's current rider from each tick's deck seat riders.
- The switch router resolves a deck seat's vehicle and seat index from its saved owner and the vehicle's saved deck seat list. A use by its wheel seat rider goes to the vehicle's headlights, including a use aimed at a room block or the vehicle entity.
- The wheel seat rider cannot switch the ceiling lights. Other riders and players inside the parked room keep using the ceiling lights under 0115's reach and cooldown rules. Headlights and ceiling lights keep their separate cooldowns.

## Consequences

- The parked camper's wheel seat operates the same headlights as its driving seat. The other seats still operate the room lights.
- The router reads the deck seat's owner and saved index when a player uses the switch. A stale or orphaned deck seat cannot claim a vehicle's headlights.
- The item event path is covered by unit tests. A manual check in Bedrock is still needed for block presses on PC and touch devices.
