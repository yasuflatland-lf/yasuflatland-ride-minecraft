import fc from "fast-check";
import { expect, it } from "vitest";
import { profileOf } from "../../../../../src/domain/vehicle/kinds/index";
import {
  rollCommand,
  SPORTSBOAT_ENTITY,
  trimCommand,
} from "../../../../../src/domain/vehicle/kinds/sportsboat/entity";
import { SPORTSBOAT_SPEC } from "../../../../../src/domain/vehicle/kinds/sportsboat/spec";
import { expectDeclaredCommand } from "../../../../support/entityContract";

it.each([
  ["trim", trimCommand, 0, SPORTSBOAT_SPEC.maxTrim],
  ["roll", rollCommand, -SPORTSBOAT_SPEC.maxRoll, SPORTSBOAT_SPEC.maxRoll],
] as const)(
  "writes the declared %s property over its range",
  (name, build, min, max) => {
    fc.assert(
      fc.property(fc.double({ min, max, noNaN: true }), (value) => {
        const command = build(value);
        expect(command).toEqual({ type: "setProperty", name, value });
        expectDeclaredCommand(
          command,
          SPORTSBOAT_ENTITY,
          profileOf("sportsboat"),
        );
      }),
    );
  },
);
