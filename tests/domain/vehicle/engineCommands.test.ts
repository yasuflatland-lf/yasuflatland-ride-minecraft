import fc from "fast-check";
import { it } from "vitest";
import { asPlayerId, asVehicleId } from "../../../src/domain/shared/ids";
import { VEHICLE_KINDS } from "../../../src/domain/vehicle/kind";
import {
  createVehicle,
  entityContractOf,
} from "../../../src/domain/vehicle/kinds/index";
import { expectDeclaredCommand } from "../../support/entityContract";
import { waterSensors } from "../../support/waterDepth";

const number = (min: number, max: number) =>
  fc.double({ min, max, noNaN: true });
const sample = fc.record({
  raw: fc.option(
    fc.record({
      moveX: number(-1, 1),
      moveY: number(-1, 1),
      jump: fc.boolean(),
    }),
    { nil: undefined },
  ),
  depth: number(0, 5),
  below: fc.boolean(),
  ground: fc.boolean(),
  solid: fc.boolean(),
  velocity: fc.record({ x: number(-2, 2), y: number(-1, 1), z: number(-2, 2) }),
  mounted: fc.boolean(),
  driverYaw: number(-180, 180),
});

it.each(VEHICLE_KINDS)(
  "emits declared commands with valid values for %s over 200 random ticks",
  (kind) => {
    fc.assert(
      fc.property(
        number(-180, 180),
        fc.array(sample, { minLength: 200, maxLength: 200 }),
        (yaw, samples) => {
          const vehicle = createVehicle(kind, asVehicleId("v"), yaw);
          const contract = entityContractOf(kind);
          samples.forEach((s, tick) => {
            const out = vehicle.tick({
              tick,
              deckSeatInputs: [],
              riders: s.mounted
                ? [
                    {
                      id: asPlayerId("driver"),
                      offset: { x: 0.38, z: -0.35 },
                      yaw: s.driverYaw,
                      raw: s.raw ?? { moveX: 0, moveY: 0, jump: false },
                    },
                  ]
                : [],
              testInput: s.raw,
              velocity: s.velocity,
              onGround: s.ground,
              ...waterSensors(s.depth, s.below),
              blockTypes: () => [],
              solidAt: () => s.solid,
              targets: () => [],
            });
            for (const command of [...out.stepCommands, ...out.finalCommands])
              expectDeclaredCommand(command, contract);
          });
        },
      ),
    );
  },
);
