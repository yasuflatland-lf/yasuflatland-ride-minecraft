import fc from "fast-check";
import { expect, it } from "vitest";
import { asPlayerId, asVehicleId } from "../../../src/domain/shared/ids";
import { CamperDrive } from "../../../src/domain/vehicle/kinds/camper/drive";
import { CAMPER_PROFILE } from "../../../src/domain/vehicle/kinds/camper/profile";
import { Vehicle } from "../../../src/domain/vehicle/vehicle";
import { riderView } from "../../support/riders";

it("recognizes the driver and the enabled wheel deck seat while held", () => {
  const seats = [...CAMPER_PROFILE.seats.positions.keys()];
  fc.assert(
    fc.property(
      fc.subarray(seats),
      fc.subarray(seats),
      fc.boolean(),
      fc.boolean(),
      (crew, deck, docked, deckSeatDriverHeadlights) => {
        const riders = crew.map((seat) =>
          riderView(`crew${seat}`, {
            seat,
            offset: CAMPER_PROFILE.seats.positions[seat],
          }),
        );
        const deckSeatRiders = seats.map((seat) =>
          deck.includes(seat) ? asPlayerId(`deck${seat}`) : undefined,
        );
        const vehicle = Vehicle.withRidersAboard(
          asVehicleId("v"),
          { ...CAMPER_PROFILE, deckSeatDriverHeadlights },
          new CamperDrive(0, { docked }),
          riders,
          0,
        );
        const outcome = vehicle.tick({
          tick: 0,
          riders,
          deckSeatRiders,
          deckSeatInputs: [],
          location: { x: 0.5, y: 64, z: 0.5 },
          velocity: { x: 0, y: 0, z: 0 },
          onGround: true,
          solidAt: () => false,
          waterAt: () => false,
          targets: () => [],
          blockTypes: (cells) => cells.map(() => "minecraft:air"),
        });
        for (const player of [
          ...riders.map((r) => r.id),
          ...deck.map((seat) => asPlayerId(`deck${seat}`)),
          asPlayerId("outside"),
        ]) {
          expect(vehicle.atTheWheel(player)).toBe(
            player === outcome.driverId ||
              (docked &&
                deckSeatDriverHeadlights &&
                player === deckSeatRiders[0]),
          );
        }
      },
    ),
  );
});
