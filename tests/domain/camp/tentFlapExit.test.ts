import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { FLAP_IDS } from "../../../src/domain/camp/flaps";
import { flapCells, type TentPose } from "../../../src/domain/camp/tent";
import { tentFlapExitCells } from "../../../src/domain/camp/tentFlapExit";
import { cellKey } from "../../../src/domain/shared/cells";
import { defined } from "../../support/defined";

const arbPose: fc.Arbitrary<TentPose> = fc.record({
  x: fc.integer({ min: -1000, max: 1000 }),
  y: fc.integer({ min: -60, max: 300 }),
  z: fc.integer({ min: -1000, max: 1000 }),
  yaw: fc.constantFrom(0 as const, 90 as const, 180 as const, -90 as const),
});
const fraction = fc.oneof(
  fc.constant(0.5),
  fc.double({ min: 0, max: 0.999, noNaN: true }),
);
const offsets = fc.record({ x: fraction, y: fraction, z: fraction });

describe("tentFlapExitCells (ADR 0212)", () => {
  it("chooses orthogonal neighbours on the feet's side, never any flap cell", () => {
    fc.assert(
      fc.property(arbPose, offsets, (pose, offset) => {
        // Independent cardinal axes keep this oracle separate from the tent transform.
        const depth = {
          0: { x: 0, z: -1 },
          90: { x: 1, z: 0 },
          180: { x: 0, z: 1 },
          [-90]: { x: -1, z: 0 },
        }[pose.yaw];
        const localX = { x: -depth.z, z: depth.x };
        const keys = new Set(
          FLAP_IDS.flatMap((id) => flapCells(pose, id)).map(cellKey),
        );
        for (const flap of FLAP_IDS) {
          const cells = flapCells(pose, flap);
          const normal =
            flap === "front" || flap === "bedroom" ? depth : localX;
          for (const cell of cells) {
            const feet = {
              x: cell.x + offset.x,
              y: cell.y + offset.y,
              z: cell.z + offset.z,
            };
            const [preferred, opposite] = tentFlapExitCells(
              pose,
              flap,
              cell,
              feet,
            );
            const projection =
              (feet.x - cell.x - 0.5) * normal.x +
              (feet.z - cell.z - 0.5) * normal.z;
            const dx = preferred.x - cell.x;
            const dz = preferred.z - cell.z;
            expect(Math.abs(dx) + Math.abs(dz)).toBe(1);
            expect(dx * normal.z - dz * normal.x + 0).toBe(0);
            expect(preferred.y).toBe(cell.y);
            expect(dx * normal.x + dz * normal.z).toBe(
              projection === 0
                ? flap === "left"
                  ? -1
                  : 1
                : Math.sign(projection),
            );
            expect(opposite).toEqual({
              x: cell.x - dx,
              y: cell.y,
              z: cell.z - dz,
            });
            expect(keys.has(cellKey(preferred))).toBe(false);
            expect(keys.has(cellKey(opposite))).toBe(false);
          }
        }
      }),
    );
  });

  it("breaks exact centre ties inside at every pose and flap", () => {
    fc.assert(
      fc.property(arbPose, (pose) => {
        for (const flap of FLAP_IDS) {
          const cell = defined(flapCells(pose, flap)[0], "flap cell");
          const feet = { x: cell.x + 0.5, y: cell.y, z: cell.z + 0.5 };
          const [target] = tentFlapExitCells(pose, flap, cell, feet);
          const centre = { x: pose.x - cell.x, z: pose.z - cell.z };
          if (flap === "left" || flap === "right")
            expect(
              (target.x - cell.x) * centre.x + (target.z - cell.z) * centre.z,
            ).toBeGreaterThan(0);
          else {
            // A front flap at the next depth is one cell nearer the bedroom.
            const bedroom = defined(
              flapCells(pose, "bedroom")[0],
              "bedroom cell",
            );
            const front = defined(flapCells(pose, "front")[0], "front cell");
            expect(
              (target.x - cell.x) * (bedroom.x - front.x) +
                (target.z - cell.z) * (bedroom.z - front.z),
            ).toBeGreaterThan(0);
          }
        }
      }),
    );
  });
});
