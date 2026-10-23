import fc from "fast-check";
import { expect, it } from "vitest";
import { FORMS } from "../../../../src/domain/vehicle/motion/forms";
import {
  formCommands,
  transformingProperties,
} from "../../../../src/domain/vehicle/motion/transformingEntity";

it("keeps gravity on only in car form and writes the form after the event (ADR 0021, 0039)", () => {
  fc.assert(
    fc.property(fc.constantFrom(...FORMS), (form) => {
      expect(formCommands(form)).toStrictEqual([
        {
          type: "triggerEvent",
          name: form === "car" ? "gravity_on" : "gravity_off",
        },
        { type: "setProperty", name: "form", value: form },
      ]);
    }),
  );
});

it("switches gravity off for submarine before writing its form", () => {
  expect(formCommands("submarine")).toStrictEqual([
    { type: "triggerEvent", name: "gravity_off" },
    { type: "setProperty", name: "form", value: "submarine" },
  ]);
});

it("declares a bank range of plus or minus maxBank (ADR 0026)", () => {
  fc.assert(
    fc.property(fc.double({ min: 0.5, max: 90, noNaN: true }), (maxBank) => {
      expect(transformingProperties(maxBank).bank).toStrictEqual({
        type: "float",
        range: [-maxBank, maxBank],
      });
    }),
  );
});

// -0 does not survive JSON, so a pack written as [0, 0] would never match the contract.
it("declares a bank range of [0, 0] with no negative zero when the kind has no bank", () => {
  const [low, high] = transformingProperties(0).bank.range;
  expect(Object.is(low, 0)).toBe(true);
  expect(Object.is(high, 0)).toBe(true);
  expect(JSON.parse(JSON.stringify(transformingProperties(0)))).toStrictEqual(
    transformingProperties(0),
  );
});
