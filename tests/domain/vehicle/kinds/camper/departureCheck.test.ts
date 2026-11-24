import fc from "fast-check";
import { expect, it, vi } from "vitest";
import { cellKey } from "../../../../../src/domain/shared/cells";
import type { Vec3 } from "../../../../../src/domain/shared/vec";
import type { TickContext } from "../../../../../src/domain/vehicle/drive";

import { slotCells } from "../../../../../src/domain/vehicle/kinds/camper/decorCells";
import { STORAGE_DOORS } from "../../../../../src/domain/vehicle/kinds/camper/furniture";
import {
  isPassable,
  parkCheckCells,
} from "../../../../../src/domain/vehicle/kinds/camper/groundCheck";
import { CamperParking } from "../../../../../src/domain/vehicle/kinds/camper/parking";
import { parkPose } from "../../../../../src/domain/vehicle/kinds/camper/parkPose";
import { exitCells } from "../../../../../src/domain/vehicle/kinds/camper/roomCells";
import { AIR } from "../../../../../src/domain/vehicle/kinds/camper/roomGeometry";
import {
  cargoCells,
  storagePlateChecks,
} from "../../../../../src/domain/vehicle/kinds/camper/storagePlates";
import { Hold } from "../../../../../src/domain/vehicle/motion/dock";

const location = { x: 10.2, y: 64.005, z: -8.7 };
const pose = fc
  .integer({ min: 0, max: 3 })
  .map((q) => parkPose(location, q * 90));

function context(
  at: Vec3,
  observed: string | undefined,
  owned: boolean,
): TickContext {
  const matches = (cell: Vec3) => cellKey(cell) === cellKey(at);
  return {
    tick: 0,
    location,
    velocity: { x: 0, y: 0, z: 0 },
    onGround: true,
    deckSeatInputs: [],
    solidAt: () => false,
    waterAt: () => false,
    blockTypes: (cells) =>
      cells.map((cell) => (matches(cell) ? observed : AIR)),
    ownsLaidBlock: (cell, typeId) =>
      matches(cell) && typeId === observed && owned,
  };
}

const observedType = fc.constantFrom(
  AIR,
  undefined,
  "other:camper_furniture",
  "test:laid",
);

it("allows an occupied parking cell only when the camper owns the observed block", () => {
  fc.assert(
    fc.property(
      pose.chain((p) =>
        fc.tuple(fc.constant(p), fc.constantFrom(...parkCheckCells(p))),
      ),
      observedType,
      fc.boolean(),
      ([p, at], observed, owned) => {
        const parking = new CamperParking(new Hold(false), false);
        expect(parking.clearFor(p, context(at, observed, owned))).toEqual(
          observed === AIR || (observed !== undefined && owned)
            ? []
            : undefined,
        );
      },
    ),
  );
});

it("checks cargo, slot and plate ownership, and exit clearance in one departure batch", () => {
  fc.assert(
    fc.property(
      pose.chain((p) => {
        const cargo = cargoCells(p);
        const slots = slotCells(p);
        const plates = storagePlateChecks(p, STORAGE_DOORS).map(
          ({ cell }) => cell,
        );
        const exits = exitCells(p);
        const groups = { cargo, slots, plates, exits };
        return fc
          .constantFrom(...Object.entries(groups))
          .chain(([group, cells]) =>
            fc.tuple(
              fc.constant({
                p,
                group,
                batch: [...cargo, ...slots, ...plates, ...exits],
              }),
              fc.constantFrom(...cells),
            ),
          );
      }),
      observedType,
      fc.boolean(),
      ([{ p, group, batch }, at], observed, owned) => {
        const ctx = context(at, observed, owned);
        const read = vi.spyOn(ctx, "blockTypes");
        const parking = new CamperParking(new Hold(false), false);
        const isExit = group === "exits";
        expect(parking.departureCheck(p, ctx)).toEqual({
          blocked:
            !isExit &&
            observed !== AIR &&
            !(group !== "cargo" && observed !== undefined && owned),
          exitClear: !isExit || isPassable(observed),
        });
        expect(read).toHaveBeenCalledExactlyOnceWith(batch);
      },
    ),
  );
});
