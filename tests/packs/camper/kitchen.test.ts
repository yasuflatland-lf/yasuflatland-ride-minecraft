import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { defined } from "../../support/defined";
import { bone, cubeCenter, end, near, swatch } from "./helpers";

const body = bone("body").cubes ?? [];

describe("camper kitchen top", () => {
  it("matches the catalogue cube totals for each kitchen part", () => {
    const areas = JSON.parse(
      readFileSync("tests/packs/fixtures/camper-areas.json", "utf8"),
    );
    for (const [part, count] of [
      ["counter", 20],
      ["range", 36],
      ["burner", 209],
    ] as const) {
      const [first, last] = areas[part].body;
      expect(last - first + 1, part).toBe(count);
    }
  });
  it("centres its single ignition dial and twelve-slot 7.3 px vent on the burner at z 32", () => {
    const slots = body.filter(
      (c) => near(c.origin[0], -22.3) && near(c.origin[1], 30.35),
    );
    expect(slots).toHaveLength(12);
    expect(Math.min(...slots.map((c) => c.origin[2] ?? 0))).toBeCloseTo(28.75);
    const vent = body.find(
      (c) => near(c.origin[0], -22.4) && near(c.origin[1], 29.95),
    );
    expect(vent).toBeDefined();
    if (!vent) throw new Error("Missing vent");
    expect(vent.size[2]).toBeCloseTo(7.3);
    expect(cubeCenter(vent, 2)).toBeCloseTo(32);
    const dial = body.filter(
      (c) => near(c.origin[0], -8.18) && near(c.origin[1], 27.39),
    );
    expect(dial).toHaveLength(1);
    expect(cubeCenter(defined(dial[0], "ignition dial"), 2)).toBeCloseTo(32);
  });

  it("keeps its three-piece notched sink cover flush and separate from the twin taps", () => {
    const cover = body.filter(
      (c) =>
        near(c.size[1], 0.13) &&
        (near(c.origin[0], -20) || near(c.origin[0], -11.6)),
    );
    expect(cover).toHaveLength(3);
    const taps = body.filter(
      (c) => near(c.origin[0], -21.05) && near(c.size[1], 0.65),
    );
    expect(taps).toHaveLength(2);
    for (const c of cover) {
      expect(end(c, 1)).toBeCloseTo(30);
      for (const tap of taps) {
        expect(
          c.origin.every(
            (v, axis) =>
              v < end(tap, axis) && end(c, axis) > (tap.origin[axis] ?? 0),
          ),
        ).toBe(false);
      }
    }
    expect(
      cover.some(
        (c) =>
          (c.origin[0] ?? 0) <= -11.2 &&
          end(c, 0) > -11.2 &&
          (c.origin[2] ?? 0) < 20 &&
          end(c, 2) > 20,
      ),
    ).toBe(false);
  });

  it("leaves a recessed opening beneath the finger notch in the complete counter", () => {
    const point = [-11.2, 29.9, 20];
    const filling = body.filter(
      (c) =>
        !c.rotation &&
        point.every((v, axis) => v > (c.origin[axis] ?? 0) && v < end(c, axis)),
    );
    expect(filling).toEqual([]);
    const basin = body.filter(
      (c) =>
        !c.rotation &&
        point.every((v, axis) =>
          axis === 1
            ? (c.origin[axis] ?? 0) < 29.8 && end(c, axis) >= 29.8
            : v > (c.origin[axis] ?? 0) && v < end(c, axis),
        ),
    );
    expect(basin).toHaveLength(1);
  });

  it("uses the reduced 209-cube open-bore burner with six raised grate feet", () => {
    const burner = body.filter(
      (c) =>
        (c.origin[0] ?? 0) > -18 &&
        end(c, 0) < -14 &&
        (c.origin[2] ?? 0) > 30 &&
        end(c, 2) < 34 &&
        (c.origin[1] ?? 0) >= 30 &&
        end(c, 1) <= 30.951,
    );
    expect(burner).toHaveLength(209);
    expect(
      burner.filter((c) => near(end(c, 1), 30.95) && swatch(c, "black")),
    ).toHaveLength(6);
  });
});
