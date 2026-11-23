import { expect, it } from "vitest";
import { MONITOR_TOOL_ITEMS } from "../../../../src/domain/vehicle/kinds/index";

it("lists each monitor tool only once", () => {
  expect(new Set(MONITOR_TOOL_ITEMS).size).toBe(MONITOR_TOOL_ITEMS.length);
});
