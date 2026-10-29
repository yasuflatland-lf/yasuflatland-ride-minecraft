import fc from "fast-check";
import { expect, it } from "vitest";
import { asVehicleId } from "../../../../../src/domain/shared/ids";
import { forward, localPoint } from "../../../../../src/domain/shared/vec";
import type { TickContext } from "../../../../../src/domain/vehicle/drive";
import { rebuildVehicle } from "../../../../../src/domain/vehicle/kinds";
import { BulldozerDrive } from "../../../../../src/domain/vehicle/kinds/bulldozer/drive";
import {
  BULLDOZER_SPEC,
  BULLDOZER_WIDE_BLADE,
} from "../../../../../src/domain/vehicle/kinds/bulldozer/spec";
import { type Body, engineStep } from "../../../../support/engineModel";

function flatGround(tick: number, b: Body): TickContext {
  return {
    tick,
    deckSeatInputs: [],
    location: { ...b.pos, y: 64 },
    velocity: { ...b.vel, y: 0 },
    onGround: true,
    solidAt: () => false,
    waterAt: () => false,
    blockTypes: () => [],
  };
}

const FORWARD = { moveX: 0, moveY: 1, jump: false };
it.each([false, true])(
  "covers everything the blade swept while driving forward (wide=%s)",
  (wide) =>
    fc.assert(
      fc.property(fc.double({ min: -180, max: 180, noNaN: true }), (yaw) => {
        const d = new BulldozerDrive(yaw, { blade: 0, wide_blade: wide });
        let b: Body = { pos: { x: 0.5, z: 0.5 }, vel: { x: 0, z: 0 } };
        let previous: ReturnType<typeof d.step> | undefined;
        let prev = b.pos;
        for (let tick = 0; tick < 80; tick++) {
          const out = d.step(FORWARD, flatGround(tick, b));
          if (previous?.cut?.length && out.cut?.length) {
            const keys = new Set(
              [...previous.cut, ...out.cut].map((c) => `${c.x},${c.z}`),
            );
            for (const t of [0, 0.25, 0.5, 0.75, 1])
              for (const a of [1, 1.95, 2.9])
                for (const s of [-1, 0, 1].map(
                  (side) =>
                    side *
                    (wide ? BULLDOZER_WIDE_BLADE : BULLDOZER_SPEC.blade)
                      .halfWidth,
                )) {
                  const p = localPoint(
                    {
                      x: prev.x + (b.pos.x - prev.x) * t,
                      z: prev.z + (b.pos.z - prev.z) * t,
                    },
                    forward(yaw),
                    a,
                    s,
                  );
                  expect(
                    keys.has(`${Math.floor(p.x)},${Math.floor(p.z)}`),
                  ).toBe(true);
                }
          }
          previous = out;
          prev = b.pos;
          b = engineStep(b, out.impulse, { mu: 0.69 }).body;
        }
        const reverse = new BulldozerDrive(yaw, { blade: 0, wide_blade: wide });
        b = { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
        for (let tick = 0; tick < 80; tick++) {
          const out = reverse.step(
            { ...FORWARD, moveY: -1 },
            flatGround(tick, b),
          );
          expect(out.cut ?? []).toEqual([]);
          b = engineStep(b, out.impulse, { mu: 0.69 }).body;
        }
      }),
    ),
);
it("cuts under server test input with no driver", () => {
  const v = rebuildVehicle("bulldozer", asVehicleId("b"), 0, [], {
    blade: 0,
  });
  let b: Body = { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
  for (let tick = 0; tick < 30; tick++) {
    const out = v.tick({
      tick,
      riders: [],
      testInput: FORWARD,
      deckSeatInputs: [],
      location: { ...b.pos, y: 64 },
      velocity: { ...b.vel, y: 0 },
      onGround: true,
      solidAt: () => false,
      waterAt: () => false,
      blockTypes: () => [],
      targets: () => [],
    });
    if (v.speed <= 0.02) expect(out.cut).toEqual([]);
    if (tick >= 9) expect(out.cut.length).toBeGreaterThan(0);
    b = engineStep(b, out.impulse, { mu: 0.69 }).body;
  }
});
