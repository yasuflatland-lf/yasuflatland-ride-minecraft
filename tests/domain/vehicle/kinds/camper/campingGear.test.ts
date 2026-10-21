import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
  CAMPING_GEAR,
  CAMPING_GEAR_IDS,
} from "../../../../../src/domain/vehicle/kinds/camper/campingGear";
import { CAMPER_FURNITURE } from "../../../../../src/domain/vehicle/kinds/camper/furniture";

const spec: { id: string; places: string[] }[] = JSON.parse(
  readFileSync("tools/camping_gear.json", "utf8"),
);

it("matches tools/camping_gear.json item for item and place for place (ADR 0093)", () => {
  expect([...CAMPING_GEAR]).toEqual(spec.map((g) => [g.id, g.places]));
  expect(CAMPING_GEAR_IDS).toEqual(spec.map((g) => g.id));
});

it("places every item only on furniture that has slots", () => {
  for (const places of CAMPING_GEAR.values())
    for (const place of places)
      expect(
        CAMPER_FURNITURE.some((f) => f.kind === place && f.slots.length > 0),
      ).toBe(true);
});
