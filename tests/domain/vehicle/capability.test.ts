import fc from "fast-check";
import { expect, it } from "vitest";
import { capabilityKey, offer } from "../../../src/domain/vehicle/capability";

it("returns the offered value only for the same key, even when names match", () => {
  fc.assert(
    fc.property(fc.string(), fc.jsonValue(), (name, value) => {
      const offered = capabilityKey<typeof value>(name);
      const other = capabilityKey<typeof value>(name);
      expect(Object.isFrozen(offered)).toBe(true);
      expect(offer(offered, offered, value)).toBe(value);
      expect(offer(other, offered, value)).toBeUndefined();
    }),
  );
});
