import fc from "fast-check";
import { expect, it, vi } from "vitest";
import type { Vec3 } from "../../../../../src/domain/shared/vec";
import type { DecorPlacement } from "../../../../../src/domain/vehicle/dock/decor";
import type { TickContext } from "../../../../../src/domain/vehicle/drive";
import { DECOR_CELLS } from "../../../../../src/domain/vehicle/kinds/camper/decor";
import {
  decorBlockName,
  ownSlotBlock,
  slotCells,
} from "../../../../../src/domain/vehicle/kinds/camper/decorCells";
import { STORAGE_DOORS } from "../../../../../src/domain/vehicle/kinds/camper/furniture";
import { isPassable } from "../../../../../src/domain/vehicle/kinds/camper/groundCheck";
import { CamperParking } from "../../../../../src/domain/vehicle/kinds/camper/parking";
import { parkPose } from "../../../../../src/domain/vehicle/kinds/camper/parkPose";
import { exitCells } from "../../../../../src/domain/vehicle/kinds/camper/roomCells";
import { AIR } from "../../../../../src/domain/vehicle/kinds/camper/roomGeometry";
import {
  cargoCells,
  holdsCargo,
  ownPlateBlock,
  storagePlateChecks,
} from "../../../../../src/domain/vehicle/kinds/camper/storagePlates";
import { Hold } from "../../../../../src/domain/vehicle/motion/dock";
import { decorItemId, decorSlotId } from "../../../../support/decorIds";

it("checks cargo, each slot and plate, and both exits against the original departure predicates", () => {
  const blocked = fc.constantFrom(undefined, "minecraft:stone");
  const decor: DecorPlacement[] = [
    { slot: decorSlotId("dashboard_center"), item: decorItemId("road_map") },
  ];
  const location = { x: 10.2, y: 64.005, z: -8.7 };
  const readings = fc.integer({ min: 0, max: 3 }).chain((quarter) => {
    const pose = parkPose(location, quarter * 90);
    const cargo = cargoCells(pose);
    const slots = slotCells(pose);
    const plates = storagePlateChecks(pose, STORAGE_DOORS);
    const exits = exitCells(pose);
    // Inject at most one obstruction per group so all three checks can affect the result.
    const obstruct = (clear: string[]) =>
      fc
        .tuple(
          fc.option(fc.integer({ min: 0, max: clear.length - 1 })),
          blocked,
        )
        .map(([index, type]) =>
          clear.map((original, i) => (i === index ? type : original)),
        );
    return fc
      .record({
        cargoTypes: obstruct(cargo.map(() => AIR)),
        slotTypes: fc
          .tuple(
            ...DECOR_CELLS.map(({ cell }) => {
              const name = decorBlockName(cell, decor);
              return fc.constantFrom(
                AIR,
                "yasu_ride:camper_furniture",
                ...(name === undefined ? [] : [`yasu_ride:${name}`]),
              );
            }),
          )
          .chain(obstruct),
        plateTypes: fc
          .tuple(
            ...plates.map(({ door }) =>
              fc.constantFrom(AIR, `yasu_ride:${door.unit.plateBlockName}`),
            ),
          )
          .chain(obstruct),
        exitTypes: obstruct(exits.map(() => AIR)),
      })
      .map((types) => ({ pose, cargo, slots, plates, exits, ...types }));
  });

  fc.assert(
    fc.property(readings, (reading) => {
      const {
        pose,
        cargo,
        slots,
        plates,
        exits,
        cargoTypes,
        slotTypes,
        plateTypes,
        exitTypes,
      } = reading;
      const blockTypes = vi.fn((_cells: readonly Vec3[]) => [
        ...cargoTypes,
        ...slotTypes,
        ...plateTypes,
        ...exitTypes,
      ]);
      const ctx: TickContext = {
        tick: 0,
        location,
        velocity: { x: 0, y: 0, z: 0 },
        onGround: true,
        deckSeatInputs: [],
        blockTypes,
        solidAt: () => false,
        waterAt: () => false,
      };
      const result = new CamperParking(new Hold(false), false).departureCheck(
        pose,
        ctx,
        decor,
      );

      expect(blockTypes.mock.calls).toEqual([
        [[...cargo, ...slots, ...plates.map(({ cell }) => cell), ...exits]],
      ]);
      expect(result).toEqual({
        blocked:
          holdsCargo(cargoTypes) ||
          DECOR_CELLS.some(
            ({ cell }, i) =>
              !ownSlotBlock(slotTypes[i], decorBlockName(cell, decor)),
          ) ||
          plates.some(({ door }, i) => !ownPlateBlock(plateTypes[i], door)),
        exitClear: exitTypes.every(isPassable),
      });
    }),
  );
});
