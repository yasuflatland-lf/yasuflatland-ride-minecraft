# Seats and driver selection

- Scope: Which seat a rider takes, how a boarding player picks one, and who drives, for the SUV, camper, sports boat, and bulldozer.
- Verified at: fd83ec4e
- Source: [0007](../adr/0007-seats-and-driver.md)
- Source: [0019](../adr/0019-passengers-move-up-to-the-driver-seat.md)
- Source: [0025](../adr/0025-jump-on-touch-and-a-sticky-driver.md)
- Source: [0052](../adr/0052-retry-camera-switches-and-break-seat-ties-low.md)
- Source: [0069](../adr/0069-camper-right-hand-drive.md)
- Source: [0070](../adr/0070-raise-the-camper-front-seats.md)
- Source: [0104](../adr/0104-refuse-a-press-on-a-taken-seat.md)
- Source: [0120](../adr/0120-choose-a-sports-boat-seat-by-aiming-at-it.md)
- Source: [0126](../adr/0126-choose-a-new-driver-with-one-tick-of-motion.md)
- Source: [0128](../adr/0128-settle-every-crews-seats-by-rider-list.md)
- Source: [0136](../adr/0136-bulldozer.md)
- Source: [0141](../adr/0141-put-a-bulldozer-driver-out-beside-the-left-door.md)
- Source: [0154](../adr/0154-keep-camper-passengers-in-their-seats-on-departure.md)
- Excluded: [0117](../adr/0117-move-the-suv-front-seats-back.md): SUV seat coordinates, covered by suv-body
- Excluded: [0138](../adr/0138-raise-and-lower-the-bulldozer-blade.md): bulldozer blade lift, not seating
- Excluded: [0155](../adr/0155-cut-under-water-and-dig-a-shaft-when-rising.md): bulldozer cutting, not seating
- Excluded: [0195](../adr/0195-cut-the-body-height-ahead-of-a-grounded-blade.md): bulldozer cutting, not seating

## Rules

### Seat order and the driver seat

- Applies to: SUV, camper, sports boat, bulldozer; ground, flight, water, and parked.
- Rule: A kind's seats are numbered from 0 in `VehicleProfile.seats.positions` (x positive to the left, z positive forward), and those positions equal the `seats` positions of the kind's `minecraft:rideable`. Seat 0 (`DRIVER_SEAT`) is the driver seat and `controlling_seat` is 0. Only the rider in seat 0 drives. With nobody in seat 0 nobody drives and the vehicle coasts to a stop.
- Agreement: Accepted
- Basis: [0007](../adr/0007-seats-and-driver.md) Decision, "The driver seat is index 0, and `controlling_seat` is also 0"
- Basis: [0007](../adr/0007-seats-and-driver.md) Consequences, "If the driver seat is empty, nobody drives and the vehicle coasts to a stop"
- Basis: [0019](../adr/0019-passengers-move-up-to-the-driver-seat.md) Decision, "Keep the seat layout and the driver rule of 0007: four seats from `minecraft:rideable` with the driver seat at index 0"
- Implementation: `src/domain/vehicle/seats.ts` (`DRIVER_SEAT`, `nearestSeat`); `src/domain/vehicle/profile.ts` (`SeatLayout`); `src/domain/vehicle/kinds/suv/profile.ts`, `src/domain/vehicle/kinds/camper/profile.ts`, `src/domain/vehicle/kinds/sportsboat/profile.ts`, `src/domain/vehicle/kinds/bulldozer/profile.ts`; `packs/yasu_ride_bp/entities/yasu_ride/suv.se.json` (`minecraft:rideable`); `packs/yasu_ride_bp/entities/yasu_ride/camper.se.json`; `packs/yasu_ride_bp/entities/yasu_ride/sportsboat.se.json`; `packs/yasu_ride_bp/entities/yasu_ride/bulldozer.se.json`
- Verification: `tests/domain/vehicle/seats.test.ts` "keeps the driver's seat at index zero for every facing (ADR 0019)"; `tests/packs/behaviorPack.test.ts` (SUV seats equal `SUV_PROFILE.seats.positions`); `tests/packs/camper.test.ts` "matches the camper's four seat positions and collision box to its profile"; `tests/packs/sportsboat.test.ts` (`controlling_seat` 0). Not verified: a test that the bulldozer `minecraft:rideable` seat equals its profile seat; real-player seating on a device.

### Camper seat layout

- Applies to: camper, all modes.
- Rule: The camper's driver (seat 0) sits at the front right and the front passenger (seat 1) at the front left, like the SUV. Seats 2 and 3 are the dinette on the left, behind the passenger, with seat 2 facing the rear. Both front seats of the camper's `minecraft:rideable` sit higher than the dinette seats, so a seated player's eyes clear the windshield's lower frame. The values are in `camper.se.json` and `CAMPER_PROFILE.seats.positions`.
- Agreement: Accepted
- Basis: [0069](../adr/0069-camper-right-hand-drive.md) Decision, "Seat 0, the driver, sits at the front right"
- Basis: [0069](../adr/0069-camper-right-hand-drive.md) Decision, "Seats 2 and 3 stay a facing dinette on the left, now behind the passenger"
- Basis: [0070](../adr/0070-raise-the-camper-front-seats.md) Decision, "Both front seats of `minecraft:rideable` sit at 1.5 instead of 1.1, 0.4 blocks higher."
- Implementation: `src/domain/vehicle/kinds/camper/profile.ts` (`CAMPER_PROFILE.seats`); `packs/yasu_ride_bp/entities/yasu_ride/camper.se.json` (`minecraft:rideable` `seats`)
- Verification: `tests/packs/camper.test.ts` "matches the camper's four seat positions and collision box to its profile" (x and z only). Not verified: the seat heights by any test; the view over the dashboard (0070 Consequences says it is checked by hand, and no owner check with revision and device is recorded).

### Driver when riders have no rider-list index

- Applies to: any kind, only for a rider whose rider-list index (`RiderPos.slot`) is not known.
- Rule: A driver who still rides keeps driving. With no such driver, take the rider closest to seat 0 in the vehicle's local coordinates (ties go to the earlier rider in the list), and accept them only when their nearest seat is 0 as read, or when the reading moved by one tick of the vehicle's horizontal motion (`step`, from the engine velocity sensor) has nearest seat 0. Otherwise there is no driver, and no other candidate is tried. At rest, passengers on seats 1 to 3 do not drive.
- Agreement: Accepted
- Basis: [0025](../adr/0025-jump-on-touch-and-a-sticky-driver.md) Decision, "A rider who is the driver stays the driver for as long as they ride the vehicle."
- Basis: [0126](../adr/0126-choose-a-new-driver-with-one-tick-of-motion.md) Decision, "Accept that candidate only when their raw reading's nearest seat is 0, or when their reading plus one tick of the vehicle's horizontal motion has nearest seat 0."
- Basis: [0128](../adr/0128-settle-every-crews-seats-by-rider-list.md) Decision, "Keep the current driver if they remain aboard without a slot (0025)."
- Implementation: `src/domain/vehicle/seating.ts` (`Seating.pickDriver`, `Seating.update`); `src/domain/vehicle/crew.ts` (`Crew.update`)
- Verification: `tests/domain/vehicle/seating.test.ts` "keeps the driver while they ride, wherever they read", "Choosing a driver with position lag (ADR 0126)" (SUV and camper profiles, property-based), "chooses the SUV driver when both front riders lag 0.575 blocks". Not verified: in game, because the rider-list index is normally known (next rule).

### Driver and seats when riders have a rider-list index

- Applies to: every kind, for a rider whose index in the engine rider list is known.
- Rule: A rider's seat reading is their rider-list index when it is below the seat count, otherwise their nearest seat in local coordinates. The driver is the current driver if they still ride without an index; otherwise the indexed rider settled in seat 0. A position-only rider is never made driver merely because seat settlement gave them seat 0. A rider with an index becomes the driver on the tick the engine shifts the list, without waiting for their position.
- Agreement: Accepted
- Basis: [0128](../adr/0128-settle-every-crews-seats-by-rider-list.md) Decision, "For every kind, read a rider's seat from their slot when defined and below the seat count; otherwise use their nearest seat in local coordinates."
- Basis: [0128](../adr/0128-settle-every-crews-seats-by-rider-list.md) Decision, "Do not choose a position-only driver merely because collision settlement assigned them DRIVER_SEAT."
- Implementation: `src/domain/vehicle/seating.ts` (`Seating.seatsOf`, `Seating.update`); `src/domain/vehicle/seats.ts` (`RiderPos.slot`)
- Verification: `tests/domain/vehicle/seating.test.ts` "seats each rider by their slot wherever they stand, and the driver is exactly the rider in slot 0", "keeps doors and the indexed driver stable under shared lag (suv)" and "(camper)". Not verified: that real players on devices are seated by rider-list index (0128 Consequences: revisit if the engine stops doing so).

### Unique seats, ties, and leaving

- Applies to: every kind, all modes.
- Rule: Every rider gets at most one seat and no seat holds two riders. Riders are settled in a fixed order: readings that match the rider's previous seat first, then ascending rider-list index with unknown last, then input order. Each takes their reading if free, else their previous seat if free, else the free seat nearest them; an exact distance tie goes to the lower seat index. A rider beyond capacity stays unseated. A departing rider vacates their previous settled seat; vacated seats are reported ascending, and a rider who remains aboard is never reported as vacating. The drive turns each vacated seat into its door command. A rebuilt crew (`/reload`, chunk reload) settles with zero motion, so the next identical update reports no newly mounted driver.
- Agreement: Accepted
- Basis: [0128](../adr/0128-settle-every-crews-seats-by-rider-list.md) Decision, "A departing rider vacates their previous settled seat."
- Basis: [0128](../adr/0128-settle-every-crews-seats-by-rider-list.md) Decision, "Distance ties go to the lower seat index."
- Basis: [0128](../adr/0128-settle-every-crews-seats-by-rider-list.md) Decision, "Restore uses the same settlement and driver selection with zero motion, so the next identical update reports no newly mounted driver."
- Basis: [0052](../adr/0052-retry-camera-switches-and-break-seat-ties-low.md) Decision, "Use the lower seat index when two or more seats are exactly as close."
- Implementation: `src/domain/vehicle/seating.ts` (`Seating.seatsOf`, `Seating.nearestFreeSeat`, `Seating.restore`); `src/domain/vehicle/seats.ts` (`nearestSeat`); `src/domain/vehicle/vehicle.ts` (door commands from the leavers)
- Verification: `tests/domain/vehicle/seating.test.ts` "settles arbitrary readings uniquely through a sequence (suv)" and "(camper)", "K5 keeps the lagged driver's seat taken and vacates the front seat", "restore seats the riders without reporting a new driver"; `tests/domain/vehicle/seats.test.ts` "breaks an exact tie on the centerline toward the lower seat index, the driver's side". Not verified: door effects in game.

### Passenger moves up when the driver leaves (engine order)

- Applies to: kinds with `boarding.order` `"engine"` (SUV; the bulldozer has one seat), a driver who leaves while another rider remains.
- Rule: The script does not undo the engine's seating: the next rider in boarding order moves into seat 0 and becomes the driver, and the player who wants the wheel only has to wait for it. The door animation and sound of the seat the driver left play. While riders remain and nobody drives, the vehicle waits `SPEC.driverHandoverTicks` ticks for the engine to move someone up before treating it as driverless (a hovering vehicle then lands).
- Agreement: Accepted
- Basis: [0019](../adr/0019-passengers-move-up-to-the-driver-seat.md) Decision, "Accept Bedrock's behavior: when the driver gets out, the next rider in boarding order moves into the driver seat and becomes the driver."
- Basis: [0019](../adr/0019-passengers-move-up-to-the-driver-seat.md) Decision, "When someone gets out, play the door animation and sound of the seat that was emptied, as in 0007"
- Basis: [0126](../adr/0126-choose-a-new-driver-with-one-tick-of-motion.md) Decision, "Keep the 6-tick handover wait and all drive tuning unchanged."
- Implementation: `src/domain/vehicle/crew.ts` (`Crew.update`, `awaitingDriver`); `src/domain/vehicle/spec.ts` (`SPEC.driverHandoverTicks`); `packs/yasu_ride_bp/entities/yasu_ride/suv.se.json` (`minecraft:rideable`)
- Verification: in-game scenario `seats_after_driver_leaves` (`src/test-pack/scenarios/suv.ts`, `src/test-pack/catalog.ts`) on `yasu_ride_test:seat_probe`, which seats cows and not players; `tests/packs/behaviorPack.test.ts` "the seat probe copies the SUV's rideable, but seats cows instead of players"; `tests/domain/vehicle/crew.test.ts` "delegates seating and waits only within the driver handover window". Not verified: real players on devices (0019 Consequences: revisit if players behave differently); the door of the moved passenger's old seat is not emitted by design, and no owner check of the door effects is recorded.

### Touch Jump does not dismount a rider

- Applies to: SUV, camper, sports boat, bulldozer; any rider on touch or PC.
- Rule: Every drivable entity has `minecraft:input_ground_controlled`, `minecraft:can_power_jump`, and `minecraft:horse.jump_strength` with value 0, and `minecraft:movement` stays 0, so a press of Jump reaches the script and the rider stays seated. The script still sets the velocity every tick.
- Agreement: Accepted
- Basis: [0025](../adr/0025-jump-on-touch-and-a-sticky-driver.md) Decision, "The entity gets `minecraft:input_ground_controlled`, `minecraft:can_power_jump`, and `minecraft:horse.jump_strength` with value 0."
- Implementation: `packs/yasu_ride_bp/entities/yasu_ride/suv.se.json`; `packs/yasu_ride_bp/entities/yasu_ride/camper.se.json`; `packs/yasu_ride_bp/entities/yasu_ride/sportsboat.se.json`; `packs/yasu_ride_bp/entities/yasu_ride/bulldozer.se.json`
- Verification: `tests/packs/behaviorPack.test.ts` "takes Jump as a zero-strength power jump, so a touch rider's Jump does not dismount them (ADR 0025)" (SUV, including `minecraft:movement`); `tests/packs/bulldozer.test.ts` (the three components). Owner check on a phone with the SUV, BDS 1.26.52, 2026-10-11, per 0025 Context. Not verified: any test for the camper or sports boat; PC (0025 Consequences: PC was not tested with these components).

### Boarding by aim (sports boat and camper)

- Applies to: kinds with `boarding.order` `"chosen"` (sports boat, camper); a player on foot who presses the vehicle or one of its seat fillers, not sneaking and not already riding it.
- Rule: The press is cancelled and the vehicle seats the player on its next tick. With a line of sight (mouse or gamepad), each seat is a ball of radius `aimRadius` at height `aimHeight` above the vehicle's feet (`SPORTSBOAT_SPEC.seatAimHeight` and `seatAimRadius`; `CAMPER_SPEC.seatAimHeight` and `seatAimRadius`); the player gets the first free seat whose ball the line enters, else the free seat it passes nearest, measured only in front of the eye. On touch (`inputInfo.lastInputModeUsed` is `Touch`), the player gets the free seat nearest where they stand on the ground plane. A seat held for a deck-seat rider is not free to others. A tie goes to the lower seat index. When every seat is taken, nothing happens. A press on a vehicle that has not ticked yet is left to the engine.
- Agreement: Proposed
- Basis: [0120](../adr/0120-choose-a-sports-boat-seat-by-aiming-at-it.md) Decision, "A press on the boat, or on one of its seat fillers, by a player on foot (not sneaking, not already riding this boat) is cancelled in `beforeEvents.playerInteractWithEntity`."
- Basis: [0120](../adr/0120-choose-a-sports-boat-seat-by-aiming-at-it.md) Decision, "The player gets the first free seat whose ball the line of sight enters."
- Basis: [0120](../adr/0120-choose-a-sports-boat-seat-by-aiming-at-it.md) Decision, "A press on a boat that has not ticked yet is left to the engine."
- Basis: [0154](../adr/0154-keep-camper-passengers-in-their-seats-on-departure.md) Decision, "with `CAMPER_SPEC.seatAimHeight` of 1.35 and `CAMPER_SPEC.seatAimRadius` of 0.5."
- Implementation: `src/domain/vehicle/seatChoice.ts` (`aimReach`, `chooseSeat`, `ChosenSeats.request`); `src/domain/vehicle/crew.ts` (`Crew.request`); `src/domain/vehicle/vehicle.ts` (`Vehicle.requestSeat`); `src/application/vehicle/boardVehicle.ts` (`BoardVehicle`); `src/infrastructure/vehicle/bedrock/handlers/boarding.ts`; `src/domain/vehicle/profile.ts` (`SeatBoarding`); `src/domain/vehicle/kinds/sportsboat/profile.ts`; `src/domain/vehicle/kinds/camper/profile.ts`; `src/domain/vehicle/kinds/sportsboat/spec.ts`; `src/domain/vehicle/kinds/camper/spec.ts`
- Verification: `tests/domain/vehicle/seatChoice.test.ts` "aimReach (ADR 0120)", "chooseSeat (ADR 0120)", "seats a touch player, who gives no line of sight, in the free seat nearest where they stand, whichever way the boat faces"; `tests/domain/vehicle/profile.test.ts` "lets sports boat and camper players choose seats while SUV and bulldozer keep engine order (ADR 0050, 0120, 0154)"; `tests/application/vehicle/boardVehicle.test.ts`; `tests/packs/sportsboat.test.ts` (aim height and radius). Not verified: owner checks on PC, iPad, or phone (0120 Consequences lists B19 to B21); the camper's aim values in a play test (0154 Consequences); any BDS scenario of a player pressing the vehicle, because the in-game tests have no player.

### Keeping chosen seats with seat fillers (sports boat and camper)

- Applies to: kinds with `boarding.order` `"chosen"`, while riders get in and out.
- Rule: Every tick the vehicle settles who sits where, and lays the engine rider list to match: each seat's player up to the last taken seat, with an invisible `yasu_ride:seat_filler` in each free seat below it and nothing after the last player. A rider who stays keeps their seat. A rider the engine seated without a request keeps their list slot if that seat is free, else takes the lowest free seat. Requests are seated last. A player who cannot get in is replaced by a filler so the riders after them keep their seats. The `minecraft:rideable` of both kinds accepts the filler family besides players. Fillers are removed when the vehicle is released or when they load without riding a vehicle. Only a player can drive.
- Agreement: Proposed
- Basis: [0120](../adr/0120-choose-a-sports-boat-seat-by-aiming-at-it.md) Decision, "Every tick the boat settles who sits where, and then lays out the rider list to match:"
- Basis: [0120](../adr/0120-choose-a-sports-boat-seat-by-aiming-at-it.md) Decision, "A rider who stays keeps their seat."
- Basis: [0120](../adr/0120-choose-a-sports-boat-seat-by-aiming-at-it.md) Decision, "Nothing follows the last player."
- Basis: [0154](../adr/0154-keep-camper-passengers-in-their-seats-on-departure.md) Decision, "The camper's `minecraft:rideable` accepts the seat filler family, as the sports boat's does."
- Basis: [0128](../adr/0128-settle-every-crews-seats-by-rider-list.md) Decision, "Keep ChosenSeats, chosen layouts (0120), profiles, drive behavior, the handover interval, and infrastructure unchanged."
- Implementation: `src/domain/vehicle/seatChoice.ts` (`settleSeats`, `riderOrder`, `ChosenSeats.settle`); `src/infrastructure/vehicle/bedrock/seatFillers.ts` (`SeatFillers`); `packs/yasu_ride_bp/entities/yasu_ride/seat_filler.se.json`; `packs/yasu_ride_bp/entities/yasu_ride/sportsboat.se.json` (`family_types`); `packs/yasu_ride_bp/entities/yasu_ride/camper.se.json` (`family_types`)
- Verification: `tests/domain/vehicle/seatChoice.test.ts` "settleSeats (ADR 0120)", "riderOrder (ADR 0120)", "ChosenSeats (ADR 0120)", "lets two players both sit in the rear"; `tests/infrastructure/vehicle/bedrock/seatFillers.test.ts`; `tests/packs/seatFiller.test.ts`; in-game scenario `boat_seat_fillers` (`src/test-pack/catalog.ts`) on `yasu_ride_test:boat_seat_probe`, which seats cows and fillers and not players. Not verified: players (not cows) on a device; the camper's filler in game (0154 Consequences: whether BDS accepts the filler as a rider of the camper's rideable can only be confirmed in a play test); the 5-tick wait limit on a real player.

### Driver when a chosen-seat vehicle's driver leaves

- Applies to: sports boat and camper, a driver who leaves while others remain.
- Rule: When the driver gets out and seat 1 has a player, that player moves to seat 0; riders in seats 2 and 3 stay where they are. A vehicle whose only riders sit behind has no driver until a player presses it aiming at seat 0 (or, on touch, standing nearest it). A player who was about to get in and did not is not counted as a driver who left.
- Agreement: Proposed
- Basis: [0120](../adr/0120-choose-a-sports-boat-seat-by-aiming-at-it.md) Decision, "When the driver gets out and seat 1 has a player, that player moves to seat 0 as before (0019)."
- Basis: [0154](../adr/0154-keep-camper-passengers-in-their-seats-on-departure.md) Consequences, "A rear rider no longer moves up to seat 0 when the driver gets out while driving; only the seat 1 rider does (0120)."
- Implementation: `src/domain/vehicle/seatChoice.ts` (`settleSeats`)
- Verification: `tests/domain/vehicle/seatChoice.test.ts` "moves the front passenger into the driver's seat when the driver leaves, and keeps the rear riders where they are (ADR 0019)", "does not take a player who was about to get in and did not for a driver who left". Not verified: on a device, for the sports boat or the camper.

### Departure from the deck keeps seats (sports boat and camper)

- Applies to: sports boat and camper, when the parked or docked vehicle sets off with riders on its deck seats.
- Rule: On departure each rider of deck seats 0 to 3 asks for the vehicle seat of the same index, and fillers hold the empty seats below a taken one. The camper's toilet rider (deck seat 4) is not part of the layout: they are added afterwards if a seat is free, and are moved to the exit otherwise. Departure is still driven by the seat 0 stick, so a rear deck-seat rider cannot start the camper.
- Agreement: Proposed
- Basis: [0120](../adr/0120-choose-a-sports-boat-seat-by-aiming-at-it.md) Decision, "each deck seat i asks for boat seat i, which is held for its player and free while the deck seat stands."
- Basis: [0154](../adr/0154-keep-camper-passengers-in-their-seats-on-departure.md) Decision, "On departure `Crew.layout` gives each rider of deck seats 0 to 3 the vehicle seat of the same index, and fillers hold the empty seats below a taken one."
- Basis: [0154](../adr/0154-keep-camper-passengers-in-their-seats-on-departure.md) Decision, "Letting the rider of a rear deck seat start the camper stays out of scope: departure is still driven by the seat 0 stick (0063)."
- Implementation: `src/domain/vehicle/crew.ts` (`Crew.layout`); `src/application/vehicle/driveVehicles.ts` (`keepSeatLayout`, `boardDeckRiders`); `src/infrastructure/vehicle/bedrock/deckSeats.ts`
- Verification: `tests/domain/vehicle/seatChoice.test.ts` "boards each deck-seat rider into the boat seat of their deck seat when the boat sets off (ADR 0063)", "never seats a pressing player in the seat of a deck seat someone sits on, which would take it away under them (ADR 0063)"; `tests/infrastructure/vehicle/bedrock/deckSeats.test.ts`. Not verified: the camper departure with a person in a dinette seat on a device (0154 Acceptance condition, manual row C173); the known refusal of the next boarding player while only a dinette seat is held (0154 Consequences, pending C173).

### Bulldozer seat

- Applies to: bulldozer, all modes.
- Rule: The bulldozer has one seat, the driver seat, defined by `BULLDOZER_PROFILE.seats` and the `seats` entry of `bulldozer.se.json`. It boards in engine order and seats players only. Whoever occupies its only seat (seat 0) is the driver, with no choosing and no handover; the generic seat 0 rule and sticky-driver rule apply unchanged.
- Agreement: Proposed
- Basis: [0136](../adr/0136-bulldozer.md) Decision, "One driver sits at `[0, 1.4, -1.35]`."
- Implementation: `src/domain/vehicle/kinds/bulldozer/profile.ts` (`BULLDOZER_PROFILE.seats`, `boarding`); `packs/yasu_ride_bp/entities/yasu_ride/bulldozer.se.json`
- Verification: `tests/domain/vehicle/kinds/bulldozer/profile.test.ts` "gives the bulldozer its body, one seat, beams, fleet limit, and yellow paint (ADR 0136)". Not verified: the manual Bulldozer checks on PC and mobile (0136 Acceptance condition, #533, #542).

### Bulldozer driver exit

- Applies to: bulldozer, a rider who leaves seat 0 on the ground; not in flight or when the outdoor spot check fails.
- Rule: The profile's optional `seatExits` gives seat 0 the exit `BULLDOZER_SPEC.doorExit` (x left-positive, z forward-positive from the vehicle's center, beside the left door and behind the blade). For a leaving rider whose seat has an exit, the world exit is computed from the vehicle's location before this tick's move (or its dock hold) and the drive's yaw after the step. After the final commands the application asks the world to stand the rider there, and the adapter moves only a valid living player who rides nothing, is in the vehicle's dimension and within 6 blocks, and only to a spot the outdoor check accepts. Otherwise the engine's spot stays. The SUV, camper, and sports boat have no `seatExits`.
- Agreement: Proposed
- Basis: [0141](../adr/0141-put-a-bulldozer-driver-out-beside-the-left-door.md) Decision, "Add optional, kind-neutral `VehicleProfile.seatExits`, one local point per seat, with x left-positive and z forward-positive (0050)."
- Basis: [0141](../adr/0141-put-a-bulldozer-driver-out-beside-the-left-door.md) Decision, "A missing vehicle or player or any failed check keeps the engine's already checked spot."
- Implementation: `src/domain/vehicle/profile.ts` (`VehicleProfile.seatExits`); `src/domain/vehicle/kinds/bulldozer/spec.ts` (`BULLDOZER_SPEC.doorExit`); `src/domain/vehicle/vehicle.ts` (`Vehicle.seatExits`); `src/application/vehicle/driveVehicles.ts` (`standRiderAt`); `src/infrastructure/vehicle/bedrock/bedrockVehicleWorld.ts` (`standRiderAt`); `src/infrastructure/vehicle/bedrock/standUp.ts`
- Verification: `tests/domain/vehicle/vehicleSeatExit.test.ts` "places only leaving riders at the configured exit in the post-step frame"; `tests/domain/vehicle/kinds/bulldozer/profile.test.ts` "puts one exit beside the left track and behind the blade"; `tests/infrastructure/vehicle/bedrock/seatExitSpot.test.ts`; in-game scenarios `bulldozer_exit_spot` and `bulldozer_exit_ground` (`src/test-pack/scenarios/bulldozerExit.ts`). Not verified: the stand-up itself with a real player, which 0141 Consequences says is checked by hand on PC and touch (B23).

### Pressing a taken dinette seat with camping gear

- Applies to: parked camper, a player holding camping gear who presses a dinette deck seat.
- Rule: A press from a dinette deck seat names one slot (`PlaceDecorCommand.exact` is `true`; a press on a furniture or decor block has it `false`). The item goes on the pressed slot only when that slot accepts it and is free. Otherwise nothing is placed: the player sees "No free spot for this item", keeps the item, and nothing is saved. The press stays cancelled in both cases, so a refused press does not seat the player. With an empty hand or any other item the player sits as usual.
- Agreement: Accepted
- Basis: [0104](../adr/0104-refuse-a-press-on-a-taken-seat.md) Decision, "With `exact`, the item goes on the pressed slot when that slot accepts it and is free."
- Basis: [0104](../adr/0104-refuse-a-press-on-a-taken-seat.md) Decision, "The seat press stays cancelled in both cases, so a refused press does not seat the player either."
- Implementation: `src/domain/vehicle/kinds/camper/decorPlacing.ts` (`slotForPress`); `src/application/vehicle/placeDecor.ts` (`PlaceDecorCommand.exact`); `src/infrastructure/vehicle/bedrock/handlers/decor.ts` (`placeGearOnSeat`)
- Verification: `tests/domain/vehicle/kinds/camper/decorPlacing.test.ts` "with an exact press returns the pressed slot when it accepts the item and is free, else nothing, never another slot (ADR 0104)"; `tests/application/vehicle/placeDecor.test.ts` "refuses an exact press on a taken slot with the no-slot message, consuming and saving nothing (ADR 0104)". Not verified: on a device, and that an empty-handed press seats the player (no test found).

## Open issues

- Seat coordinates differ between ADRs and code: 0007 Decision (front `[-0.38, 0.1, 0.35]` and `[0.38, 0.1, 0.35]`, rear z -0.8), the 0052 seat table, and the 0126 Context (seat 0 at (-0.38, 0.2)) give the SUV values that `suv.se.json` and `SUV_PROFILE.seats.positions` no longer hold (front x of plus or minus 0.551 and z -0.04984375, rear z -1.16, y 0.73). This spec states no SUV coordinates; they belong to suv-body: `packs/yasu_ride_bp/entities/yasu_ride/suv.se.json`, `src/domain/vehicle/kinds/suv/profile.ts`.
- 0120 Decision says the SUV and the camper keep `{ order: "engine" }` and read positions, and that the boat needs no sticky driver; the code gives the camper `"chosen"` (0154) and reads the rider-list index for every kind (0128). The relations record this as a partial supersession, so this spec follows 0154 and 0128: 0120, `src/domain/vehicle/kinds/camper/profile.ts`, `src/domain/vehicle/seating.ts`.
- 0128 says no pack or infrastructure change is needed and that the infrastructure already provides every player's rider-list index, but no test or scenario checks that index for the SUV or the camper with a real player: 0128, `tests/infrastructure/vehicle/bedrock/bedrockVehicleWorld.test.ts`.
- 0025 Decision gives the three Jump components for "the entity" (the SUV), while the camper, sports boat, and bulldozer also carry them; only the SUV and the bulldozer have a pack test: `tests/packs/behaviorPack.test.ts`, `tests/packs/bulldozer.test.ts`.
- 0154 Consequences accept a known regression (a dinette-only held layout refuses the next boarding player) until manual row C173 passes; the code has no workaround and no test pins the refusal: 0154, `src/domain/vehicle/crew.ts`.
- Agreement of the chosen-seat, bulldozer, and deck-departure rules is Proposed because 0120, 0136, 0141, and 0154 are Proposed (owner decisions pending on #1193), while 0126 and 0128 (Accepted) already build on 0120 (for 0128: `Extends: 0120`): `docs/adr/README.md`. The firmness of "Driver when a chosen-seat vehicle's driver leaves" and the 0126/0128 rules is therefore limited by Proposed 0120, despite Agreement: Accepted on the 0128 rules.
