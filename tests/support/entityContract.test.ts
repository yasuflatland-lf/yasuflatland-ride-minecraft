import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { EntityContract } from "../../src/domain/vehicle/entityContract";
import { expectDeclaredCommand } from "./entityContract";

const CONTRACT: EntityContract = {
  properties: { phase: { type: "int", range: [0, 2] } },
  events: [],
  animations: [],
  restored: [],
};

describe("expectDeclaredCommand", () => {
  it("accepts every integer inside an int property's range", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2 }), (v) => {
        expect(() =>
          expectDeclaredCommand(
            { type: "setProperty", name: "phase", value: v },
            CONTRACT,
          ),
        ).not.toThrow();
      }),
    );
  });

  it("rejects an int property value outside its range", () => {
    fc.assert(
      fc.property(
        fc.integer().filter((v) => v < 0 || v > 2),
        (v) => {
          expect(() =>
            expectDeclaredCommand(
              { type: "setProperty", name: "phase", value: v },
              CONTRACT,
            ),
          ).toThrow();
        },
      ),
    );
  });

  it("rejects a fractional int property value", () => {
    fc.assert(
      fc.property(
        fc
          .double({ min: 0, max: 2, noNaN: true })
          .filter((v) => !Number.isInteger(v)),
        (v) => {
          expect(() =>
            expectDeclaredCommand(
              { type: "setProperty", name: "phase", value: v },
              CONTRACT,
            ),
          ).toThrow();
        },
      ),
    );
  });

  it("rejects a boolean for an int property", () => {
    expect(() =>
      expectDeclaredCommand(
        { type: "setProperty", name: "phase", value: true },
        CONTRACT,
      ),
    ).toThrow();
  });
});
