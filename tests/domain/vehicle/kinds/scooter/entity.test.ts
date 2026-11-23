import fc from "fast-check";
import { expect, it } from "vitest";
import { profileOf } from "../../../../../src/domain/vehicle/kinds/index";
import {
  leanCommand,
  SCOOTER_ENTITY,
  standCommand,
  steerCommand,
} from "../../../../../src/domain/vehicle/kinds/scooter/entity";
import { SCOOTER_SPEC } from "../../../../../src/domain/vehicle/kinds/scooter/spec";
import { CORE_PROPERTY_NAMES } from "../../../../support/coreContract";
import { expectDeclaredCommand } from "../../../../support/entityContract";

it("reserves core properties and fits the entity property budget", () => {
  const properties = Object.keys(SCOOTER_ENTITY.properties);
  expect(properties.length + CORE_PROPERTY_NAMES.length).toBeLessThanOrEqual(
    32,
  );
  for (const name of CORE_PROPERTY_NAMES)
    expect(properties).not.toContain(name);
  expect(SCOOTER_ENTITY.restored).toEqual(["form"]);
});

it.each([
  ["lean", leanCommand, -SCOOTER_SPEC.maxLean, SCOOTER_SPEC.maxLean],
  ["steer", steerCommand, -SCOOTER_SPEC.maxSteer, SCOOTER_SPEC.maxSteer],
] as const)(
  "writes the declared %s property over its range",
  (name, build, min, max) => {
    fc.assert(
      fc.property(fc.double({ min, max, noNaN: true }), (value) => {
        const command = build(value);
        expect(command).toEqual({ type: "setProperty", name, value });
        expectDeclaredCommand(command, SCOOTER_ENTITY, profileOf("scooter"));
      }),
    );
  },
);

it.each([["stand", standCommand]] as const)(
  "writes the declared %s boolean property",
  (name, build) => {
    for (const value of [false, true]) {
      const command = build(value);
      expect(command).toEqual({ type: "setProperty", name, value });
      expectDeclaredCommand(command, SCOOTER_ENTITY, profileOf("scooter"));
    }
  },
);
