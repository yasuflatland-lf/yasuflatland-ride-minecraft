# 0120. Choose a sports boat seat by aiming at it

- Status: Proposed
- Date: 2026-10-22
- Supersedes in part: 0019 (for the sports boat: the script now keeps riders in their seats), 0025 (for the sports boat: the driver is the player at rider-list index 0, without the sticky driver), 0063 (a deck-seat rider can land in a lower seat on departure)
- Extends: 0050, 0051

## Context

Issue #460, from play on an iPad (dev BDS, main 2547dbf6): on the sports boat, a player who tries to sit in a rear seat always ends up in a front seat. Even with two players aboard, nobody can sit in the rear.

The boat's `minecraft:rideable` has four seats with `controlling_seat` 0, and there is no script hook for choosing one of them. Bedrock seats riders by their index in the rider list (0019): the first player gets seat 0, the second seat 1, wherever they stand or aim. When a rider gets out, everyone behind them moves up one seat. The script only reads where the engine put people (`occupiedSeats` in `seats.ts`). 0063 already says that a seat "cannot be chosen through the boat's own `minecraft:rideable`".

The only way to choose a seat today is a deck seat (0063), and it does not help in this case:

- A boat with a driver never docks, because the drive counts still ticks only while there is no driver input. So with one player in seat 0 there are no deck seats, and the second player's only option is a press on the boat, which puts them in seat 1.
- On departure, `DeckSeats.board` adds the deck-seat riders in deck seat order. Each one lands on the next free list index, so a player who sat on rear deck seat 2 with the driver on deck seat 0 rides off in seat 1. 0063 accepted this.
- 0063 also leaves open whether a press on a deck seat reaches it through the boat's hit boxes.

Neither the SUV nor the camper chooses seats either. The camper chooses them only while parked, through deck seats (0068, 0095). Nobody has reported a problem with them.

Because the seat is the list index, a player reaches seat k only if k riders are ahead of them in the list. With two players, the free seats below a chosen one must be held by something else. These designs were considered:

- **Invisible seat fillers in the free seats below a chosen one (chosen).** This uses stable APIs only: `addRider`, `ejectRider`, `spawnEntity`, and `beforeEvents.playerInteractWithEntity`. It works whether the boat is docked or moving, from the water or from the deck.
- **Let a boat with a driver dock, and keep the order on departure.** This only helps on a stopped boat. Boarding from the water still lands in front.
- **A rear bench entity riding the boat at index 0, with `controlling_seat` moved to 1.** This depends on unverified nested riding offsets and rotation, changes the engine's seat indices, and is hard to recover when the bench is ejected.
- **Rear seat entities teleported every tick while moving.** At 1.12 blocks per tick the riders would jitter.
- **Re-adding riders in a new order without fillers.** This cannot work with two players, because the seat is the list index.

## Decision

- **Per-kind setting (0050).** `VehicleProfile.boarding` is `{ order: "engine" }` for the SUV and the camper, so they behave as before, and `{ order: "chosen", aimHeight, aimRadius }` for the sports boat. `aimHeight` is `SPORTSBOAT_SPEC.seatAimHeight = 0.52`, the height of the boat's seats in `minecraft:rideable`. `aimRadius` is `SPORTSBOAT_SPEC.seatAimRadius = 0.38`, half the 0.76 between the left and right seats, so the balls of neighbouring seats touch but never overlap. Shared code reads this setting and never checks the vehicle kind.
- **Choosing the seat.** A press on the boat, or on one of its seat fillers, by a player on foot (not sneaking, not already riding this boat) is cancelled in `beforeEvents.playerInteractWithEntity`. The boat then seats the player itself on its next tick. The before event has no hit point, so the aim comes from the player, in the boat's own coordinates:
  - A mouse or gamepad player presses what the crosshair points at, so they aim along `getViewDirection()` from `getHeadLocation()`. Each seat is a ball of `aimRadius` at `aimHeight` above the boat's feet. The player gets the first free seat whose ball the line of sight enters. When it enters none, they get the free seat it passes nearest, measured only in front of the eye. This holds from any height and angle: a level look from behind the stern, a look up from low in the water, and an aim just above a seat all reach the seat aimed at. A first idea, crossing the line of sight with the seat height and otherwise falling back to the point nearest the boat's center, sent each of these to a front seat.
  - A touch player (`inputInfo.lastInputModeUsed` is `Touch`) presses the boat wherever it shows on the screen, and the view direction points at the middle of the screen, not at the press. So they get the free seat nearest where they stand, on the ground plane. To sit in a rear seat they swim or walk to it and press the boat.
  - A tie goes to the lower index, as in 0052. When every seat is taken, nothing happens.
  - A press on a boat that has not ticked yet is left to the engine.
- **Keeping the seats (`settleSeats` in `seatChoice.ts`).** Every tick the boat settles who sits where, and then lays out the rider list to match:
  - A rider who stays keeps their seat.
  - When the driver gets out and seat 1 has a player, that player moves to seat 0 as before (0019). The rear riders stay where they are.
  - A player the engine seated without a request (for example after `/reload`) keeps their list slot if that seat is free, and otherwise takes the lowest free seat.
  - Requests are seated last, each in the free seat it aims at.
  - While the boat is docked, the seat of each deck seat with a player on it is held for that player. A request from anyone else skips it, because seating them there would remove the deck seat and drop its player (0063).
  - A player seated by a request who did not get in is dropped. This does not count as a driver getting out.
- **Rider list.** The list holds each seat's player up to the last taken seat, with an invisible `yasu_ride:seat_filler` in each free seat below it. Nothing follows the last player. On each tick, before the deck riders board:
  - `SeatFillers.lay` keeps the riders that are already in order.
  - It ejects the riders from the first one out of order onwards and adds the list from there. A boarding player is first taken off any other mount, such as a deck seat, and is put back on it if the boat refuses them. A full boat is not tried, since the other mount may not take the player back in the tick they got off it.
  - The engine does not add back a rider in the tick they got off the same vehicle: in the first CI run of `boat_seat_fillers`, the rear cow ejected and added again in one tick was refused, and a filler took its seat (`fillersAfter=3`). So an ejected filler is removed and a new one spawned in its place. An ejected player waits instead: the layout stops at them, and the next tick adds them and the rest of the list. While they wait, the snapshot still counts them as riding the boat, at the list index they wait for (`SeatFillers.waitingRiders`), so they keep their seat. A player still refused after 5 ticks in a row, or one who can no longer get in, gets a filler like any other player who cannot get in.
  - A player who cannot get in (gone, dead, in another dimension, or more than 8 blocks away) is replaced by a filler, so the riders after them keep their seats.
  - A filler that cannot spawn or get in is skipped and removed, and the players after it still get back on. They sit one seat lower until the next tick lays them again, which is better than staying ejected and losing their seat.
  - Fillers that are not needed are removed.
  - A filler may sit in seat 0. Only a player can drive, because `Seating` counts only players.
- **Reading the seats.** On the boat, `Seating` reads each player's seat from their index in the rider list, which the layout keeps equal to their seat. It no longer reads it from their position. An index does not lag the way a position does while the engine moves a rider (0019 measured up to 5 ticks), so a player laid again into a rear seat never reads as the driver on the way. The driver is the player at index 0, so the sticky driver of 0025 is not needed on the boat. The SUV and the camper still read positions.
- **Departure from the deck.** When the boat moves its deck-seat riders in (0063), each deck seat i asks for boat seat i, which is held for its player and free while the deck seat stands. So a player who sat on a rear deck seat rides off in that rear seat.
- **Seat filler entity.**
  - It is in families `yasu_ride_seat_filler` and `inanimate`, so the ram query skips it. It has a 0.1 by 0.1 collision box, no gravity, no collision, no pushing, and takes no damage.
  - Its client entity draws the deck seat's empty model.
  - The boat's `minecraft:rideable` lets `yasu_ride_seat_filler` ride besides players.
  - A press or hit on a filler counts as one on the boat it rides (`vehicleOfTarget`).
  - Fillers are removed when the boat is released (broken, removed by the vehicle limit, or no longer loaded). A filler that loads without riding a vehicle is also removed.
- **In-game test.** `boat_seat_fillers` checks this on `yasu_ride_test:boat_seat_probe`, which has the boat's `minecraft:rideable` but seats cows and fillers:
  - With `SeatFillers` laying driver, filler, rear, the rear cow sits in seat 2.
  - After the driver is ejected and the list is laid again every tick, as the boat does, the rear cow waits a tick and gets back into seat 2, with two fillers holding seats 0 and 1 and no third one.
  - Laying an empty list leaves no fillers.
  
  A unit test keeps the probe's `minecraft:rideable` equal to the boat's apart from `family_types`.

## Consequences

- On PC, a player picks a boat seat by looking at it while pressing the boat. On touch, they pick it by where they stand when they press the boat. Two players can both sit in the rear, and a passenger can sit behind an empty driver's seat.
- A touch player who uses the crosshair (split controls) still gets the seat nearest where they stand, because the input mode does not tell the two touch layouts apart.
- A boat holds up to three extra entities, one for each free seat below the last taken seat. They exist only while someone sits behind them.
- When a lower seat empties or fills, the riders behind it get off and back on a tick later. Their camera may flicker for a moment. `DeckSeats.board` ejects and adds riders in the same tick, which works because the rider gets off one entity and on another.
- A rear passenger no longer moves up when the driver gets out. Only the front passenger takes the wheel (0019, 0078). A boat whose only riders sit in the rear has no driver until someone presses it aiming at seat 0.
- The rows B13, B15 and B18 of the manual test change, and new rows check two players in the rear from the water and from the deck on PC (B19, B20) and on an iPad or phone (B21).
- Unverified: this ADR relies on these points, and the in-game test and a playtest should confirm them:
  - Fillers ride the boat and keep their list index like any rider.
  - `getRiders()` returns the riders in list order.
  - A player ejected in one tick is taken back on the next. CI showed that a cow is not taken back in the same tick. The in-game test reports how many ticks the cow waited (`waited`, `backAt`), and up to 5 are allowed.
  - The engine fires `playerInteractWithEntity` for a press on the boat from the water or the shore.
  
  If the press on the boat does not reach the server from the deck (0063), a player there still uses a deck seat. If players are not seated by list index as the cows were, revisit this decision.
