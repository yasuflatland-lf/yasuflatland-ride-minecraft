# 0095. Sit on the camper toilet while parked

- Status: Accepted (extended by [0098](0098-a-block-for-the-camper-shower-toilet.md))
- Date: 2026-10-21
- Extends: 0063, 0068, 0093

## Context

#347 asks for a toilet in the camper's shower-toilet (0093) that players can sit on while the camper is parked, using one more deck seat like the dinette's (0063, 0068). The camper has four seats in `minecraft:rideable`, and a fifth vehicle seat would let a player ride on the toilet while driving, which #347 rules out.

Deck seats are already kept as a list of any length: the aggregate blanks deck seat i only when vehicle seat i is taken, only deck seat 0's stick boards the riders, and departure removes every deck seat. Three things assumed one deck seat per vehicle seat:

- A deck seat's box is 0.8 wide and reaches 0.68 blocks above the floor, so on the toilet it would cover most of the shower-toilet floor. Empty-hand long-presses on that floor open the shower-toilet door and run the shower through the room's `playerInteractWithBlock` handler, and they reach the script only when the player's aim hits the floor block, not an entity in front of it.
- On departure, a deck rider the vehicle refuses stays on the deck seat until the seats are removed (0063). With four vehicle seats and four deck seats that cannot happen in the camper; with a fifth deck seat it happens when all four seats are full. 0093 says only that this rider "is left standing", without saying where. A player standing inside without a seat is already moved to the exit when it is clear (0068).
- `DECK_SEAT_REACH`, which sizes the orphan check, counted only the profile's seats.

## Decision

- A profile may list `parkedSeats`: seats that exist only as deck seats while the vehicle is parked, after the deck seats of its vehicle seats, in order. The camper has one, the toilet: x -1.031 (right), z -3.0 (rear), the center of the toilet seat, at the dinette's rise of 0.68 because the toilet seat is as high as the dinette seats. Its deck seat index is 4, and no vehicle seat ever blanks it
- A deck seat can be compact: the toilet seat is the same `yasu_ride:deck_seat` entity, but the script triggers `yasu_ride:compact` when it spawns it, which adds a component group with a 0.5 wide, 0.8 high box. It covers the toilet only, so empty-hand long-presses on the floor around it still hit the floor block and reach the shower-toilet door and the shower
- The toilet rider's stick does nothing. When the driver's deck seat rider sets off (0063, 0068), the toilet rider is moved into the camper after the other deck riders, like any deck rider; if every seat is taken, they stay on the toilet seat, and on departure they are taken off it and treated like a player standing inside without a seat: moved to the exit if it is clear, or left standing if it is not (0068). This refines 0093's "the rider is left standing": the rider is left standing only when the exit is blocked
- `DECK_SEAT_REACH` covers every kind's seats and parked seats

## Consequences

- A parked camper spawns up to five deck seats instead of four
- A player can sit on the toilet with the shower-toilet door closed, because the door is drawn by the model and has no collision
- With five players aboard, the toilet rider is the one left behind at departure, outside the door unless the exit is blocked
- Check on a phone and on PC that long-pressing the toilet seats the player, and that long-pressing the floor beside it with an empty hand, from the aisle and from inside, reaches the shower-toilet door and the shower instead. If the compact box still catches those long-presses, shrink it before release
