import fc from "fast-check";
import { expect, it } from "vitest";
import {
  groundRoofTentCells,
  planRoofTent,
  supportsGroundRoofTent,
} from "../../../src/domain/camp/roofTent/placement";
import { cellKey, cellOf } from "../../../src/domain/shared/cells";
import { CLEARABLE_DECORATIONS } from "../../../src/domain/shared/decorations";
import { asVehicleId } from "../../../src/domain/shared/ids";
import type { RoofTentMount } from "../../../src/domain/shared/roofTent";

const mountArb: fc.Arbitrary<RoofTentMount> = fc.record({
  roofHeight: fc.double({ min: 0, max: 5, noNaN: true }),
  anchor: fc.record({
    x: fc.double({ noNaN: true }),
    z: fc.double({ noNaN: true }),
  }),
  ladder: fc.boolean(),
  shell: fc.constantFrom("raised", "flat" as const),
  entrance: fc.record({
    x: fc.double({ noNaN: true }),
    z: fc.double({ noNaN: true }),
  }),
});
const yawArb = fc.double({ min: -1e4, max: 1e4, noNaN: true });

it("plans a free roof on a supported vehicle with the mount's shell and ladder", () => {
  fc.assert(
    fc.property(
      fc.string().map(asVehicleId),
      mountArb,
      yawArb,
      (id, mount, yaw) => {
        const plan = planRoofTent({
          target: { type: "vehicle", id, mount, roofTaken: false },
          yaw,
        });
        expect(plan).toMatchObject({
          host: { kind: "vehicle", id: asVehicleId(id) },
          ladder: mount.ladder,
          shell: mount.shell,
        });
      },
    ),
  );
});

it("refuses a taken roof", () => {
  fc.assert(
    fc.property(
      fc.string().map(asVehicleId),
      mountArb,
      yawArb,
      (id, mount, yaw) => {
        expect(
          planRoofTent({
            target: { type: "vehicle", id, mount, roofTaken: true },
            yaw,
          }),
        ).toBe("roof_taken");
      },
    ),
  );
});

it("refuses a host in use before a taken roof", () => {
  fc.assert(
    fc.property(fc.boolean(), mountArb, yawArb, (roofTaken, mount, yaw) => {
      expect(
        planRoofTent({
          target: {
            type: "vehicle",
            id: asVehicleId("a"),
            mount,
            roofTaken,
            hostInUse: true,
          },
          yaw,
        }),
      ).toBe("host_in_use");
    }),
  );
});

it("refuses a vehicle without a mount, taken roof or not", () => {
  for (const roofTaken of [false, true]) {
    expect(
      planRoofTent({
        target: {
          type: "vehicle",
          id: asVehicleId("a"),
          mount: undefined,
          roofTaken,
        },
        yaw: 0,
      }),
    ).toBe("unsupported_vehicle");
  }
});

it("plans on the ground iff it is clear, without a ladder", () => {
  fc.assert(
    fc.property(fc.boolean(), yawArb, (clear, yaw) => {
      const plan = planRoofTent({ target: { type: "ground", clear }, yaw });
      if (clear) {
        expect(plan).toMatchObject({
          host: { kind: "ground" },
          shell: "flat",
          ladder: false,
        });
      } else {
        expect(plan).toBe("blocked");
      }
    }),
  );
});

it("uses the clicked support cell and two clear layers across the 3 by 3 footprint", () => {
  fc.assert(
    fc.property(
      fc.record({ x: fc.integer(), y: fc.integer(), z: fc.integer() }),
      (clicked) => {
        const { support, clear } = groundRoofTentCells(cellOf(clicked));
        expect(support).toEqual([clicked]);
        expect(clear).toHaveLength(18);
        expect(new Set(clear.map(cellKey)).size).toBe(18);
        for (const cell of clear) {
          expect(Math.abs(cell.x - clicked.x)).toBeLessThanOrEqual(1);
          expect(Math.abs(cell.z - clicked.z)).toBeLessThanOrEqual(1);
          expect([1, 2]).toContain(cell.y - clicked.y);
        }
      },
    ),
  );
});

it("accepts non-liquid, non-air support including partial blocks and rejects decorations", () => {
  fc.assert(
    fc.property(
      fc.oneof(
        fc.constant("minecraft:stone_slab"),
        fc.constantFrom(...CLEARABLE_DECORATIONS),
      ),
      fc.boolean(),
      fc.boolean(),
      (typeId, isAir, isLiquid) => {
        expect(supportsGroundRoofTent({ typeId, isAir, isLiquid })).toBe(
          typeId === "minecraft:stone_slab" && !isAir && !isLiquid,
        );
      },
    ),
  );
  expect(supportsGroundRoofTent(undefined)).toBe(false);
});
