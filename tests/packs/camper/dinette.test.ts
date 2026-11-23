import { describe, expect, it } from "vitest";
import { CAMPER_FURNITURE } from "../../../src/domain/vehicle/kinds/camper/furniture";
import { defined } from "../../support/defined";
import { turnedCorners } from "../../support/geometry";
import { areaCubes, bone } from "./helpers";

describe("camper model assets (ADR 0067)", () => {
  it("keeps the facing dinette on the left behind the passenger, clear of the bed and side walls", () => {
    for (const name of ["seat_0", "seat_1", "headlights"]) {
      expect(bone(name).cubes?.length).toBeGreaterThan(0);
    }
    expect(bone("seat_0").cubes?.every((c) => (c.origin[0] ?? 0) < 0)).toBe(
      true,
    );
    expect(bone("seat_1").cubes?.every((c) => (c.origin[0] ?? 0) > 0)).toBe(
      true,
    );
    const cells = defined(
      CAMPER_FURNITURE.find(({ kind }) => kind === "dinette_seat"),
      "dinette cells",
    ).cells;
    const passengerBack = Math.max(
      ...(bone("seat_1").cubes ?? []).flatMap((cube) =>
        turnedCorners(bone("seat_1"), cube).map(([, , z]) => z),
      ),
    );
    const bedFront = Math.min(
      ...areaCubes("bed_bunk")
        .filter(({ owner }) => owner.name === "body")
        .flatMap(({ owner, cube }) =>
          turnedCorners(owner, cube).map(([, , z]) => z),
        ),
    );
    for (const [name, front] of [
      ["seat_2", true],
      ["seat_3", false],
    ] as const) {
      const seat = bone(name);
      const cell = defined(
        cells.find(({ z }) => z > 0 === front),
        name,
      );
      const zCenter = -16 * cell.z;
      const points = (seat.cubes ?? []).flatMap((cube) =>
        turnedCorners(seat, cube),
      );
      expect(points.length).toBeGreaterThan(0);
      for (const [x, y, z] of points) {
        expect(x).toBeGreaterThanOrEqual(16 * cell.x - 8 - 1e-6);
        expect(x).toBeLessThanOrEqual(23 + 1e-6); // Inner face of the side wall.
        expect(y).toBeGreaterThanOrEqual(16 * cell.layer - 1e-6);
        expect(z).toBeGreaterThanOrEqual(
          Math.max(zCenter - 8, passengerBack) - 1e-6,
        );
        expect(z).toBeLessThanOrEqual(Math.min(zCenter + 8, bedFront) + 1e-6);
      }
    }
  });
});
