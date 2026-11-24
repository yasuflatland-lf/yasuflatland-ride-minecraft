import type { Dimension, Entity, Player } from "@minecraft/server";
import fc from "fast-check";
import { expect, it, vi } from "vitest";
import { type Cell, cellOf } from "../../../src/domain/shared/cells";
import { CLEARABLE_DECORATIONS } from "../../../src/domain/shared/decorations";
import {
  makeSafeStand,
  playerRiderOf,
  seatRider,
} from "../../../src/infrastructure/shared/seating";

vi.mock("@minecraft/server", () => ({}));

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

it("requires a dry, non-decoration floor and two air cells outside vehicle and camp space", () => {
  const acceptedFloors = [
    "minecraft:stone",
    "minecraft:torch",
    "minecraft:magma",
  ];
  fc.assert(
    fc.property(
      fc.constantFrom(
        ...acceptedFloors,
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
            return {
              typeId: air[cell.y] ? "minecraft:air" : "minecraft:short_grass",
              isAir: air[cell.y],
              isLiquid: false,
            };
          },
          getBlockAbove: () => {
            throw Error("seat exits do not need a solidity probe");
          },
        };
        const isSafe = makeSafeStand(dimension as unknown as Dimension, {
          isVehicleSpace: (_, cell) => vehicle[cell.y] === true,
          isCampSpace: (_, cell) => camp[cell.y] === true,
        });
        expect(isSafe(cellOf({ x: 0, y: 0, z: 0 }))).toBe(
          acceptedFloors.includes(floor) &&
            air.every(Boolean) &&
            !vehicle.some(Boolean) &&
            !camp.some(Boolean),
        );
      },
    ),
  );
});

it.each([0, 1])("rejects an unavailable body cell at height %s", (y) => {
  const getBlock = vi.fn((cell: Cell) => ({
    typeId: cell.y === -1 ? "minecraft:torch" : "minecraft:air",
    isAir: cell.y !== -1,
    isLiquid: false,
  }));
  const getBlockAbove = vi.fn(() => {
    throw Error("unavailable");
  });
  const dimension = { getBlock, getBlockAbove } as unknown as Dimension;
  const isSafe = makeSafeStand(dimension as unknown as Dimension, {
    isVehicleSpace: () => false,
    isCampSpace: () => false,
  });
  expect(isSafe(cellOf({ x: 0, y: 0, z: 0 }))).toBe(true);
  expect(getBlockAbove).not.toHaveBeenCalled();
  getBlock.mockImplementation((cell) => {
    if (cell.y === y) throw Error("unloaded");
    return { typeId: "minecraft:stone", isAir: cell.y !== -1, isLiquid: false };
  });
  expect(isSafe(cellOf({ x: 0, y: 0, z: 0 }))).toBe(false);
});

it("finds the first player among any mix of riders", () => {
  fc.assert(
    fc.property(fc.array(fc.boolean()), (players) => {
      const riders = players.map((isPlayer, i) => ({
        id: String(i),
        typeId: isPlayer ? "minecraft:player" : "minecraft:pig",
      }));
      const entity = { getComponent: () => ({ getRiders: () => riders }) };
      const firstPlayer = players.indexOf(true);
      expect(playerRiderOf(entity as unknown as Entity)).toBe(
        firstPlayer < 0 ? undefined : String(firstPlayer),
      );
    }),
  );
});
