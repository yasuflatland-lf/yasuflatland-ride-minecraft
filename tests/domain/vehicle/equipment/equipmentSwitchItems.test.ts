import { expect, it } from "vitest";
import { EQUIPMENT_SWITCH_ITEMS } from "../../../../src/domain/vehicle/kinds/index";

it("lists each equipment switch only once", () => {
  expect(new Set(EQUIPMENT_SWITCH_ITEMS).size).toBe(
    EQUIPMENT_SWITCH_ITEMS.length,
  );
});
