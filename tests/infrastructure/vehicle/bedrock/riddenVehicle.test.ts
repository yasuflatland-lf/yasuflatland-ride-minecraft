import type { Entity } from "@minecraft/server";
import fc from "fast-check";
import { expect, it } from "vitest";
import { ENTITY_TYPE } from "../../../../src/infrastructure/vehicle/bedrock/identifiers";
import { riddenVehicle } from "../../../../src/infrastructure/vehicle/bedrock/riddenVehicle";

it("returns only the add-on vehicle the player rides", () => {
  fc.assert(
    fc.property(
      fc.option(
        fc.record({
          id: fc.string(),
          typeId: fc.constantFrom(
            ...Object.values(ENTITY_TYPE),
            "minecraft:pig",
          ),
        }),
        { nil: undefined },
      ),
      (mount) => {
        const player = {
          getComponent: (name: string) =>
            name === "minecraft:riding" && mount
              ? { entityRidingOn: mount }
              : undefined,
        } as unknown as Entity;
        expect(riddenVehicle(player)).toBe(
          mount && mount.typeId !== "minecraft:pig" ? mount : undefined,
        );
      },
    ),
  );
});
