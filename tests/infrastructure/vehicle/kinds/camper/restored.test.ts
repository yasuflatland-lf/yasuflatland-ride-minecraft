import type { Entity } from "@minecraft/server";
import fc from "fast-check";
import { expect, it, vi } from "vitest";
import {
  DECK_CELLS_PROPERTY,
  DECOR_PROPERTY,
} from "../../../../../src/infrastructure/vehicle/bedrock/identifiers";
import { readCamperRestored } from "../../../../../src/infrastructure/vehicle/kinds/camper/restored";

vi.mock("@minecraft/server", async () =>
  (
    await import("../../../../support/bedrockVehicleMocks")
  ).bedrockVehicleEngine(),
);

it.each([undefined, false, true])(
  "restores saved camper room values with door state %s",
  (doorOpen) => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({ x: fc.integer(), y: fc.integer(), z: fc.integer() }),
        ),
        fc.record({ x: fc.integer(), y: fc.integer(), z: fc.integer() }),
        fc.constantFrom(0, 1, 2, 3),
        fc.option(fc.string(), { nil: undefined }),
        (floor, door, face, decor) => {
          const cells = [
            ...floor.map((cell) => ({ ...cell, block: { type: "floor" } })),
            ...(doorOpen === undefined
              ? []
              : [{ ...door, block: { type: "door", face, open: doorOpen } }]),
          ];
          const getDynamicProperty = (key: string) => {
            if (key === DECK_CELLS_PROPERTY) return JSON.stringify(cells);
            if (key === DECOR_PROPERTY) return decor;
            return undefined;
          };
          const vehicle = { getDynamicProperty } as unknown as Entity;
          expect(readCamperRestored(vehicle)).toStrictEqual({
            dockLaid: cells.length > 0,
            dockDoorOpen: doorOpen,
            dockDecor: decor,
          });
        },
      ),
    );
  },
);
