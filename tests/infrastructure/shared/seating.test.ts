import type { Dimension, Entity, Player } from "@minecraft/server";
import fc from "fast-check";
import { expect, it, vi } from "vitest";
import type { Cell } from "../../../src/domain/shared/cells";
import { CLEARABLE_DECORATIONS } from "../../../src/domain/shared/decorations";
import {
  makeSafeStand,
  seatRider,
} from "../../../src/infrastructure/shared/seating";

function seatingFixture() {
  const dimension = { id: "overworld" };
  const addRider = vi.fn(() => true);
  const entity = {
    isValid: true,
    dimension,
    location: { x: 10, y: 64, z: 20 },
    getRotation: () => ({ y: 0 }),
    getComponent: vi.fn(() => ({ addRider })),
  };
  const player = {
    isValid: true,
    dimension,
    getComponent: vi.fn<() => unknown>(() => undefined),
    teleport: vi.fn(),
  };
  const seat = (offset = { x: 0, y: 0, z: 0 }) =>
    seatRider(entity as unknown as Entity, player as unknown as Player, offset);
  return { entity, player, addRider, seat };
}

it("rotates every seat axis before adding the rider", () => {
  fc.assert(
    fc.property(
      fc.record({
        x: fc.integer({ min: -5, max: 5 }),
        y: fc.integer({ min: -5, max: 5 }),
        z: fc.integer({ min: -5, max: 5 }),
      }),
      (offset) => {
        const rotated = [
          { x: -offset.x, z: -offset.z },
          { x: offset.z, z: -offset.x },
          { x: offset.x, z: offset.z },
          { x: -offset.z, z: offset.x },
        ];
        rotated.forEach((horizontal, turn) => {
          const f = seatingFixture();
          f.entity.getRotation = () => ({ y: turn * 90 });
          expect(f.seat(offset)).toBe(true);
          const [at, options] = f.player.teleport.mock.calls[0] ?? [];
          expect(at.x).toBeCloseTo(f.entity.location.x + horizontal.x);
          expect(at.y).toBe(f.entity.location.y + offset.y);
          expect(at.z).toBeCloseTo(f.entity.location.z + horizontal.z);
          expect(options).toEqual({ dimension: f.entity.dimension });
          expect(f.player.teleport).toHaveBeenCalledBefore(f.addRider);
          expect(f.addRider).toHaveBeenCalledExactlyOnceWith(f.player);
        });
      },
    ),
  );
});

it.each(["invalid entity", "invalid player", "riding", "different dimension"])(
  "refuses seating without side effects for %s",
  (reason) => {
    const f = seatingFixture();
    if (reason === "invalid entity") f.entity.isValid = false;
    if (reason === "invalid player") f.player.isValid = false;
    if (reason === "riding") f.player.getComponent.mockReturnValue({});
    if (reason === "different dimension") f.player.dimension = { id: "nether" };
    expect(f.seat()).toBe(false);
    expect(f.player.teleport).not.toHaveBeenCalled();
    expect(f.addRider).not.toHaveBeenCalled();
  },
);

it("returns failed mounts and lets the caller handle engine errors", () => {
  const f = seatingFixture();
  f.addRider.mockReturnValue(false);
  expect(f.seat()).toBe(false);
  f.player.teleport.mockImplementation(() => {
    throw Error("unloaded");
  });
  expect(() => f.seat()).toThrow("unloaded");
});

it("requires a solid floor and two air cells outside vehicle and camp space", () => {
  fc.assert(
    fc.property(
      fc.constantFrom(
        "minecraft:stone",
        "minecraft:air",
        "minecraft:water",
        ...CLEARABLE_DECORATIONS,
        "unloaded",
        "missing",
      ),
      fc.tuple(fc.boolean(), fc.boolean()),
      fc.tuple(fc.boolean(), fc.boolean()),
      fc.tuple(fc.boolean(), fc.boolean()),
      (floor, air, vehicle, camp) => {
        const dimension = {
          getBlock: (cell: Cell) => {
            if (cell.y === -1) {
              if (floor === "unloaded") throw Error("unloaded");
              if (floor === "missing") return undefined;
              return {
                typeId: floor,
                isAir: floor === "minecraft:air",
                isLiquid: floor === "minecraft:water",
              };
            }
            return { isAir: air[cell.y] };
          },
        };
        const isSafe = makeSafeStand({
          isVehicleSpace: (cell) => vehicle[cell.y] === true,
          isCampSpace: (cell) => camp[cell.y] === true,
        });
        expect(
          isSafe(dimension as unknown as Dimension, { x: 0, y: 0, z: 0 }),
        ).toBe(
          floor === "minecraft:stone" &&
            air.every(Boolean) &&
            !vehicle.some(Boolean) &&
            !camp.some(Boolean),
        );
      },
    ),
  );
});

it("accepts a supported clear standing cell and rejects an unavailable head cell", () => {
  const getBlock = vi.fn((cell: Cell) => ({
    typeId: cell.y === -1 ? "minecraft:stone" : "minecraft:air",
    isAir: cell.y !== -1,
    isLiquid: false,
  }));
  const dimension = { getBlock } as unknown as Dimension;
  const isSafe = makeSafeStand({
    isVehicleSpace: () => false,
    isCampSpace: () => false,
  });
  expect(isSafe(dimension, { x: 0, y: 0, z: 0 })).toBe(true);
  getBlock.mockImplementation((cell) => {
    if (cell.y === 1) throw Error("unloaded");
    return { typeId: "minecraft:stone", isAir: cell.y !== -1, isLiquid: false };
  });
  expect(isSafe(dimension, { x: 0, y: 0, z: 0 })).toBe(false);
});
