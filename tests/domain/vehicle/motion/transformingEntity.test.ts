import fc from "fast-check";
import { expect, it } from "vitest";
import { FORMS } from "../../../../src/domain/vehicle/motion/forms";
import { formCommands } from "../../../../src/domain/vehicle/motion/transformingEntity";

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
