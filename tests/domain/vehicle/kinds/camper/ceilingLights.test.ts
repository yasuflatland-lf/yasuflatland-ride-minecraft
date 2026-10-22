// The parked camper's ceiling lights: where they shine and who switches them (ADR 0115).
import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import type { Vec3 } from "../../../../../src/domain/shared/vec";
import type { DockCell } from "../../../../../src/domain/vehicle/dock/floor";
import type {
  DriveStep,
  EngineCommand,
  TickContext,
} from "../../../../../src/domain/vehicle/drive";
import type { RawInput } from "../../../../../src/domain/vehicle/driveInput";
import { CamperDrive } from "../../../../../src/domain/vehicle/kinds/camper/drive";
import { SWITCH_CLICK } from "../../../../../src/domain/vehicle/kinds/camper/entity";
import { CEILING_LIGHTS } from "../../../../../src/domain/vehicle/kinds/camper/furniture";
import {
  AIR,
  cargoCells,
  ceilingLightCells,
  compartmentCells,
  deckSeats,
  exitCells,
  insideRoom,
  parkPose,
  roomCells,
  slotCells,
} from "../../../../../src/domain/vehicle/kinds/camper/room";
import { cellKey } from "../../../../../src/domain/vehicle/lighting/headlights";
import { DOCK } from "../../../../../src/domain/vehicle/motion/dock";

const PUSH: RawInput = { moveX: 0, moveY: 1, jump: false };
const pose = fc
  .record({
    x: fc.integer({ min: -1000, max: 1000 }),
    y: fc.integer({ min: -60, max: 300 }),
    z: fc.integer({ min: -1000, max: 1000 }),
    yaw: fc.constantFrom(0, 90, 180, -90),
  })
  .map((p) => ({ ...p, x: p.x + 0.5, z: p.z + 0.5 }));
const middle = (c: Vec3, rise = 0): Vec3 => ({
  x: c.x + 0.5,
  y: c.y + rise,
  z: c.z + 0.5,
});

describe("ceiling light cells (ADR 0115)", () => {
  it("lights open room cells one under the ceiling layer, never a cell the room, a slot, or the cabinet lays", () => {
    fc.assert(
      fc.property(pose, (p) => {
        const lights = ceilingLightCells(p);
        expect(lights).toHaveLength(CEILING_LIGHTS.length);
        const cargo = new Set(cargoCells(p).map(cellKey));
        const taken = new Set(
          [
            ...roomCells(p, true, new Set(["sink", "stove"])),
            ...compartmentCells(p, [], new Set()),
            ...slotCells(p),
          ].map(cellKey),
        );
        for (const cell of lights) {
          expect(cell.block).toEqual({ type: "light" });
          expect(cell.y).toBe(p.y + 2);
          expect(cargo.has(cellKey(cell))).toBe(true);
          expect(taken.has(cellKey(cell))).toBe(false);
        }
        expect(new Set(lights.map(cellKey)).size).toBe(lights.length);
      }),
    );
  });

  it("counts a player standing on the floor or seated as inside, and the exit or the roof as outside", () => {
    fc.assert(
      fc.property(pose, (p) => {
        for (const cell of ceilingLightCells(p))
          expect(insideRoom(p, middle(cell, -1))).toBe(true);
        for (const seat of deckSeats(p)) {
          expect(insideRoom(p, seat)).toBe(true);
          if (seat.stand) expect(insideRoom(p, seat.stand)).toBe(true);
        }
        const exit = exitCells(p)[0];
        if (exit) expect(insideRoom(p, middle(exit))).toBe(false);
        expect(insideRoom(p, { x: p.x, y: p.y + 4, z: p.z })).toBe(false);
      }),
    );
  });
});

function fixture(restored: Record<string, unknown> = {}) {
  const ctx: TickContext = {
    tick: 0,
    location: { x: 10.2, y: 64.005, z: -8.7 },
    velocity: { x: 0, y: 0, z: 0 },
    onGround: true,
    deckSeatInputs: [],
    solidAt: () => false,
    waterAt: () => false,
    blockTypes: vi.fn((cells: readonly Vec3[]) => cells.map(() => AIR)),
  };
  const drive = new CamperDrive(90, restored);
  const p = parkPose(ctx.location, drive.yaw);
  const step = (raw?: RawInput): DriveStep =>
    drive.step(raw, { ...ctx, tick: ctx.tick++ });
  const park = () => {
    for (let i = 0; i <= DOCK.ticks; i++) step();
  };
  const inside = middle(ceilingLightCells(p)[0] ?? p, -1);
  return { drive, pose: p, step, park, inside };
}

const lightCells = (cells: readonly DockCell[] | undefined) =>
  (cells ?? []).filter((c) => c.block.type === "light");
const lightValues = (commands: readonly EngineCommand[]) =>
  commands.flatMap((c) =>
    c.type === "setProperty" && c.name === "ceiling_lights" ? [c.value] : [],
  );
const clicks = (commands: readonly EngineCommand[]) =>
  commands.filter((c) => c.type === "playSound").length;

describe("CamperDrive ceiling lights (ADR 0115)", () => {
  it("switches only while parked, and only for a player inside the room", () => {
    const f = fixture();
    const roof = { ...f.inside, y: f.inside.y + 3 };
    expect(f.drive.ceilingLightsReachable(f.inside)).toBe(false);
    expect(f.drive.switchCeilingLights(f.inside)).toBe(false);
    f.park();
    expect(f.drive.ceilingLightsReachable(roof)).toBe(false);
    expect(f.drive.switchCeilingLights(roof)).toBe(false);
    expect(f.drive.ceilingLightsReachable(f.inside)).toBe(true);
    expect(f.drive.switchCeilingLights(f.inside)).toBe(true);
  });

  it("lays a light under each ceiling light, lights the panels, and clicks once per switch, until switched off", () => {
    const f = fixture();
    f.park();
    const dark = f.step();
    expect(lightCells(dark.dock?.cells)).toEqual([]);
    expect(lightValues(dark.commands)).toEqual([]);
    for (const on of [true, false, true]) {
      f.drive.switchCeilingLights(f.inside);
      const out = f.step();
      expect(lightValues(out.commands)).toEqual([on]);
      expect(out.commands.filter((c) => c === SWITCH_CLICK)).toHaveLength(1);
      expect(lightCells(out.dock?.cells)).toEqual(
        on ? ceilingLightCells(f.pose) : [],
      );
      const after = f.step();
      expect(lightValues(after.commands)).toEqual([]);
      expect(clicks(after.commands)).toBe(0);
      expect(lightCells(after.dock?.cells)).toHaveLength(
        on ? CEILING_LIGHTS.length : 0,
      );
    }
  });

  it("turns the lights off on departure and parks dark the next time", () => {
    const f = fixture();
    f.park();
    f.drive.switchCeilingLights(f.inside);
    f.step();
    const out = f.step(PUSH);
    expect(out.depart).toBeDefined();
    expect(out.dock).toBeUndefined();
    expect(lightValues(out.commands)).toEqual([false]);
    expect(clicks(out.commands)).toBe(0);
    for (let i = 0; i < 40 && !f.drive.inspect().parked; i++) f.step();
    expect(f.drive.inspect().parked).toBe(true);
    expect(lightCells(f.step().dock?.cells)).toEqual([]);
  });

  it("restores lights that were on only while the camper was docked", () => {
    for (const docked of [true, false]) {
      const f = fixture({ docked, ceiling_lights: true, dockLaid: true });
      const out = f.step();
      expect(lightValues(out.commands)).toEqual([docked]);
      expect(lightCells(out.dock?.cells)).toHaveLength(
        docked ? CEILING_LIGHTS.length : 0,
      );
    }
  });
});
