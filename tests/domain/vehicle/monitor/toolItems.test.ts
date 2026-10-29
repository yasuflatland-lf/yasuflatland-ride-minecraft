import { expect, it } from "vitest";
import { VEHICLE_KINDS } from "../../../../src/domain/vehicle/kind";
import {
  MONITOR_TOOL_ITEMS,
  profileOf,
} from "../../../../src/domain/vehicle/kinds/index";

it("lists every kind's monitor tools once, and nothing else", () => {
  const declared = new Set(
    VEHICLE_KINDS.flatMap(
      (kind) => profileOf(kind).monitor?.tools.map((tool) => tool.item) ?? [],
    ),
  );
  expect(MONITOR_TOOL_ITEMS).toContain("blade_switch");
  expect(new Set(MONITOR_TOOL_ITEMS).size).toBe(MONITOR_TOOL_ITEMS.length);
  expect(new Set(MONITOR_TOOL_ITEMS)).toEqual(declared);
});
