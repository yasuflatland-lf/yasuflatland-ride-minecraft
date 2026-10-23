import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { EntityContract } from "../../src/domain/vehicle/entityContract";
import { expectDeclaredCommand, expectPackProperty } from "./entityContract";

const CONTRACT: EntityContract = {
  properties: { phase: { type: "int", range: [0, 2] } },
  events: [],
  animations: [],
  restored: [],
};

function checkPhaseCommand(value: number | boolean): void {
  expectDeclaredCommand(
    { type: "setProperty", name: "phase", value },
    CONTRACT,
  );
}

describe("expectDeclaredCommand", () => {
  it("accepts every integer inside an int property's range", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2 }), (v) => {
        expect(() => checkPhaseCommand(v)).not.toThrow();
      }),
    );
  });

  it("rejects an int property value outside its range", () => {
    fc.assert(
      fc.property(
        fc.integer().filter((v) => v < 0 || v > 2),
        (v) => {
          expect(() => checkPhaseCommand(v)).toThrow();
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
          expect(() => checkPhaseCommand(v)).toThrow();
        },
      ),
    );
  });

  it("rejects a boolean for an int property", () => {
    expect(() => checkPhaseCommand(true)).toThrow();
  });
});

describe("expectPackProperty", () => {
  it("accepts an int definition whose integer default is in range", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2 }), (d) => {
        expect(() =>
          expectPackProperty({ default: d }, { type: "int", range: [0, 2] }),
        ).not.toThrow();
      }),
    );
  });

  it("rejects an int definition whose default is out of range or fractional", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.integer({ min: 3 }),
          fc.integer({ max: -1 }),
          fc.constant(0.5),
        ),
        (d) => {
          expect(() =>
            expectPackProperty({ default: d }, { type: "int", range: [0, 2] }),
          ).toThrow();
        },
      ),
    );
  });

  it("rejects an int spec with a fractional bound", () => {
    expect(() =>
      expectPackProperty({ default: 0 }, { type: "int", range: [0, 2.5] }),
    ).toThrow();
  });

  it("rejects a float definition whose default is out of range", () => {
    expect(() =>
      expectPackProperty({ default: 2 }, { type: "float", range: [0, 1] }),
    ).toThrow();
  });

  it("accepts the bulldozer's zero-width bank range", () => {
    expect(() =>
      expectPackProperty({ default: 0 }, { type: "float", range: [0, 0] }),
    ).not.toThrow();
  });

  it("rejects a nonzero default in a zero-width range", () => {
    fc.assert(
      fc.property(
        fc
          .double({ noNaN: true, noDefaultInfinity: true })
          .filter((d) => d !== 0),
        (d) => {
          expect(() =>
            expectPackProperty(
              { default: d },
              { type: "float", range: [0, 0] },
            ),
          ).toThrow();
        },
      ),
    );
  });
});
