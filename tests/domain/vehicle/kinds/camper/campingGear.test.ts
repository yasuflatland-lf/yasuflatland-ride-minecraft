import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
  CAMPING_GEAR_IDS,
  HANGING_GEAR_IDS,
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
