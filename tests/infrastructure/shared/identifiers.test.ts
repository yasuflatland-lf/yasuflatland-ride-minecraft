import fc from "fast-check";
import { expect, it } from "vitest";
import { messageKey } from "../../../src/infrastructure/shared/identifiers";

it("builds an action bar message key for any name", () => {
  fc.assert(
    fc.property(fc.string(), (name) => {
      expect(messageKey(name)).toBe(`yasu_ride.message.${name}`);
    }),
  );
});

it("builds the night-only bed message key", () => {
  expect(messageKey("sleep_at_night")).toBe("yasu_ride.message.sleep_at_night");
});
