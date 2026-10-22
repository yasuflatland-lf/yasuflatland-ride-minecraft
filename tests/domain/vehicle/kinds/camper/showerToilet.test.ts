import fc from "fast-check";
import { expect, it, vi } from "vitest";
import type { Vec3 } from "../../../../../src/domain/shared/vec";
import type { TickContext } from "../../../../../src/domain/vehicle/drive";
import { CamperDrive } from "../../../../../src/domain/vehicle/kinds/camper/drive";
import {
  AIR,
  parkPose,
  roomCells,
} from "../../../../../src/domain/vehicle/kinds/camper/room";
import { CAMPER_SPEC } from "../../../../../src/domain/vehicle/kinds/camper/spec";
import { DOCK } from "../../../../../src/domain/vehicle/motion/dock";
import { defined } from "../../../../support/defined";

const SWING = CAMPER_SPEC.doorSwingTicks;

function parked(yaw: number) {
  const ctx: TickContext = {
    tick: 0,
    location: { x: 10.2, y: 64.005, z: -8.7 },
    velocity: { x: 0, y: 0, z: 0 },
    onGround: true,
    deckSeatInputs: [],
    solidAt: () => false,
    waterAt: () => false,
    blockTypes: (cells) => cells.map(() => AIR),
  };
  const drive = new CamperDrive(yaw, {});
  const pose = parkPose(ctx.location, drive.yaw);
  const step = () => drive.step(undefined, { ...ctx, tick: ctx.tick++ });
  for (let i = 0; i <= DOCK.ticks; i++) step();
  const column = defined(
    roomCells(pose, false).find((c) => c.block.type === "showerToilet"),
    "shower-toilet cell",
  );
  const feetAt = (dx: number, dz: number): Vec3 => ({
    x: column.x + 0.5 + dx,
    y: pose.y + 1,
    z: column.z + 0.5 + dz,
  });
  const inside = (feet: Vec3) =>
    Math.floor(feet.x) === column.x && Math.floor(feet.z) === column.z;
  return { ctx, drive, step, feetAt, inside };
}

const press = fc.record({
  gap: fc.integer({ min: 0, max: 2 * SWING }),
  dx: fc.double({ min: -2, max: 2, noNaN: true }),
  dz: fc.double({ min: -2, max: 2, noNaN: true }),
});

it("closes an open shower door from either side, opens a shut one from outside, runs the shower from inside only behind a shut door, and ignores a tap's echo within a swing (ADR 0098, 0105, 0118)", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 3 }),
      fc.array(press, { minLength: 1, maxLength: 12 }),
      (quarter, presses) => {
        const f = parked(quarter * 90);
        const door = vi.spyOn(f.drive, "useShowerDoor");
        const shower = vi.spyOn(f.drive, "runShower");
        let open = false;
        let lastToggle = Number.NEGATIVE_INFINITY;
        for (const { gap, dx, dz } of presses) {
          for (let i = 0; i < gap; i++) f.step();
          const tick = f.ctx.tick;
          const feet = f.feetAt(dx, dz);
          const within = tick - lastToggle < SWING;
          const toDoor = open || within || !f.inside(feet);
          door.mockClear();
          shower.mockClear();
          const used = f.drive.pressShowerToilet(feet, tick);
          if (toDoor) {
            expect(shower).not.toHaveBeenCalled();
            expect(used).toBe(!within);
            if (!within) {
              open = !open;
              lastToggle = tick;
            }
          } else {
            expect(door).not.toHaveBeenCalled();
            expect(shower).toHaveBeenCalledOnce();
            expect(used).toBe(true);
          }
          const cells = f.step().dock?.cells ?? [];
          expect(
            cells.filter((c) => c.block.type === "showerDoor"),
          ).toHaveLength(open ? 3 : 0);
        }
      },
    ),
    {
      examples: [
        // Opened from outside, then closed by a tap from inside: the door shuts and the
        // echo of that tap does not start the shower.
        [
          0,
          [
            { gap: 0, dx: -1, dz: 0 },
            { gap: SWING, dx: 0, dz: 0 },
            { gap: 3, dx: 0, dz: 0 },
          ],
        ],
      ],
    },
  );
});

it("ignores a press on the shower-toilet until parked", () => {
  const drive = new CamperDrive(0, {});
  expect(drive.pressShowerToilet({ x: 0, y: 0, z: 0 }, 0)).toBe(false);
});
