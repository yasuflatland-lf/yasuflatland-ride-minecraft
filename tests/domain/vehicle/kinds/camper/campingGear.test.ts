import { readFileSync } from "node:fs";
import fc from "fast-check";
import { expect, it } from "vitest";
import {
  CAMPING_GEAR_IDS,
  currentGearId,
  HANGING_GEAR_IDS,
  LEGACY_GEAR_IDS,
} from "../../../../../src/domain/vehicle/kinds/camper/campingGear";

const spec: { id: string; hanging: boolean }[] = JSON.parse(
  readFileSync("tools/camping_gear.json", "utf8"),
);

it("matches tools/camping_gear.json item for item and in which items hang (ADR 0093, 0097)", () => {
  expect(CAMPING_GEAR_IDS).toEqual(spec.map((g) => g.id));
  expect([...HANGING_GEAR_IDS]).toEqual(
    spec.filter((g) => g.hanging).map((g) => g.id),
  );
});

it("reads every current gear id unchanged", () => {
  fc.assert(
    fc.property(fc.constantFrom(...CAMPING_GEAR_IDS), (id) => {
      expect(currentGearId(id)).toBe(id);
    }),
  );
});

it("drops removed gear and migrates the oil lamp to the lantern", () => {
  expect(LEGACY_GEAR_IDS).toEqual({ lava_lamp: null, oil_lamp: "lantern" });
  expect(currentGearId("lava_lamp")).toBeUndefined();
  expect(currentGearId("oil_lamp")).toBe("lantern");
});

it("drops unknown ids, including inherited object keys", () => {
  fc.assert(
    fc.property(
      fc
        .oneof(
          fc.string(),
          fc.constantFrom("constructor", "toString", "__proto__"),
        )
        .filter(
          (id) =>
            !CAMPING_GEAR_IDS.includes(id) &&
            !Object.hasOwn(LEGACY_GEAR_IDS, id),
        ),
      (id) => {
        expect(currentGearId(id)).toBeUndefined();
      },
    ),
  );
});

it("resolves saved ids only to the current catalog", () => {
  fc.assert(
    fc.property(
      fc.oneof(
        fc.string(),
        fc.constantFrom(...CAMPING_GEAR_IDS, ...Object.keys(LEGACY_GEAR_IDS)),
      ),
      (saved) => {
        const result = currentGearId(saved);
        expect(result === undefined || CAMPING_GEAR_IDS.includes(result)).toBe(
          true,
        );
      },
    ),
  );
});
