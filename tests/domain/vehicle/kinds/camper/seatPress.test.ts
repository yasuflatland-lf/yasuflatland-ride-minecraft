import fc from "fast-check";
import { expect, it } from "vitest";
import { cellKey } from "../../../../../src/domain/shared/cells";
import {
  SeatPresses,
  seatSlotCell,
} from "../../../../../src/domain/vehicle/kinds/camper/seatPress";
import { CAMPER_SPEC } from "../../../../../src/domain/vehicle/kinds/camper/spec";

// Adding 0 turns -0 into +0: Math.floor(-0) is -0, which toEqual tells apart from the
// +0 the expected cell gets from bottom + lowest.
const coordinate = fc
  .double({ min: -1000, max: 1000, noNaN: true })
  .map((v) => v + 0);
const seat = fc.record({ x: coordinate, y: coordinate, z: coordinate });

it("finds the lowest slot cell in the seat's column, from the seat's cell up to two above, and nothing past that (ADR 0097)", () => {
  fc.assert(
    fc.property(
      seat,
      fc.uniqueArray(fc.integer({ min: -2, max: 5 })),
      (at, layers) => {
        const x = Math.floor(at.x);
        const z = Math.floor(at.z);
        const bottom = Math.floor(at.y);
        const slots = new Set(
          layers.map((dy) => cellKey({ x, y: bottom + dy, z })),
        );
        const asked: number[] = [];
        const found = seatSlotCell(at, (c) => {
          expect(c.x).toBe(x);
          expect(c.z).toBe(z);
          asked.push(c.y - bottom);
          return slots.has(cellKey(c));
        });
        const lowest = [0, 1, 2].find((dy) => layers.includes(dy));
        expect(found).toEqual(
          lowest === undefined ? undefined : { x, y: bottom + lowest, z },
        );
        expect(asked).toEqual(
          [0, 1, 2].slice(0, lowest === undefined ? 3 : lowest + 1),
        );
      },
    ),
  );
});

it("counts a player's seat press only after their presses have been idle, so a held press places once (ADR 0024, 0097)", () => {
  const idle = CAMPER_SPEC.seatPressIdleTicks;
  fc.assert(
    fc.property(
      fc.array(
        fc.record({
          gap: fc.integer({ min: 0, max: idle * 2 }),
          player: fc.constantFrom("a", "b"),
        }),
      ),
      (presses) => {
        const guard = new SeatPresses<string>();
        const last = new Map<string, number>();
        let tick = 0;
        for (const { gap, player } of presses) {
          tick += gap;
          const before = last.get(player);
          expect(guard.press(tick, player)).toBe(
            before === undefined || tick - before >= idle,
          );
          last.set(player, tick);
        }
      },
    ),
  );
});
