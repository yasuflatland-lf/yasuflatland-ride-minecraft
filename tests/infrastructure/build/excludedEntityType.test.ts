import fc from "fast-check";
import { expect, it } from "vitest";
import {
  excludedEntityType,
  isAddonEntityType,
} from "../../../src/infrastructure/build/excludedEntityType";

import { TAP_TARGET_TYPE } from "../../../src/infrastructure/build/identifiers";

it("excludes the wand tap target from structure saves", () => {
  expect(isAddonEntityType(TAP_TARGET_TYPE)).toBe(true);
});

it("excludes every entity in either add-on namespace and keeps fleet stand-ins", () => {
  fc.assert(
    fc.property(fc.string(), fc.boolean(), (suffix, fleet) => {
      expect(isAddonEntityType(`yasu_ride:${suffix}`)).toBe(true);
      expect(isAddonEntityType(`yasu_build:${suffix}`)).toBe(true);
      for (const namespace of [
        "minecraft",
        "other",
        "yasu_ride_test",
        "yasu_build_extra",
      ]) {
        const type = `${namespace}:${suffix}`;
        expect(isAddonEntityType(type)).toBe(false);
        expect(excludedEntityType(() => fleet)(type)).toBe(fleet);
      }
      expect(isAddonEntityType("yasu_ride")).toBe(false);
      expect(isAddonEntityType("yasu_build")).toBe(false);
    }),
  );
});
