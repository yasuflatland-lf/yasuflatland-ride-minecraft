import fc from "fast-check";
import { expect, it } from "vitest";
import { VEHICLE_KINDS } from "../../../../src/domain/vehicle/kind";
import {
  EQUIPMENT_SWITCH_ITEMS,
  equipmentSwitchOf,
  profileOf,
} from "../../../../src/domain/vehicle/kinds/index";

const switches = VEHICLE_KINDS.flatMap(
  (kind) => profileOf(kind).equipment?.switches ?? [],
);
const items = switches.map(({ item }) => item);

it("lists each equipment switch only once across all vehicle kinds", () => {
  expect(new Set(items).size).toBe(items.length);
  expect(EQUIPMENT_SWITCH_ITEMS).toEqual(items);
});

it("resolves exactly the declared switch handles by item name", () => {
  fc.assert(
    fc.property(
      fc.oneof(
        fc.string(),
        fc.constantFrom("constructor", "__proto__", ...items),
      ),
      (item) => {
        expect(equipmentSwitchOf(item)).toBe(
          switches.find((entry) => entry.item === item),
        );
      },
    ),
  );
});
