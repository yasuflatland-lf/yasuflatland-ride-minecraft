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

// BDS 1.26.52.3 rejects [0.0, 0.0]: "range max is less than range min" (ADR 0136).
it("declares a bank range of [0, 1] with no negative zero when the kind has no bank", () => {
  // toStrictEqual tells -0 from +0.
  expect(transformingProperties(0).bank.range).toStrictEqual([0, 1]);
  const properties = transformingProperties(0);
  expect(JSON.parse(JSON.stringify(properties))).toStrictEqual(properties);
});
