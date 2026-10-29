import type { Entity } from "@minecraft/server";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { SpaceCheck } from "../../../../src/application/shared/ports/space";
import { cellKey } from "../../../../src/domain/shared/cells";
import { asVehicleId } from "../../../../src/domain/shared/ids";
import {
  LIGHT_BLOCK,
  lightBlockId,
} from "../../../../src/infrastructure/shared/lightBlocks";
import { HeadlightBlocks } from "../../../../src/infrastructure/vehicle/bedrock/headlightBlocks";
import { LIT_CELLS_PROPERTY } from "../../../../src/infrastructure/vehicle/bedrock/identifiers";
import { blockGrid } from "../../../support/blockGrid";
import { defined } from "../../../support/defined";

const noCampSpace: SpaceCheck = () => false;

const cell = fc.record({
  level: fc.integer({ min: 0, max: 15 }),
  x: fc.integer({ min: -3, max: 3 }),
  y: fc.integer({ min: -3, max: 3 }),
  z: fc.integer({ min: -3, max: 3 }),
});
const cells = fc.uniqueArray(cell, {
  selector: cellKey,
  minLength: 1,
  maxLength: 4,
});

function vehicleIn(grid: ReturnType<typeof blockGrid>): Entity {
  const saved = new Map<string, unknown>();
  return {
    id: "car",
    isValid: true,
    dimension: { id: "overworld", getBlock: grid.getBlock },
    getDynamicProperty: (key: string) => saved.get(key),
    setDynamicProperty: (key: string, value: unknown) => saved.set(key, value),
  } as unknown as Entity;
}

describe("HeadlightBlocks (ADR 0020)", () => {
  it("lights the wanted air cells and turns them back into air when the headlights go off", () => {
    fc.assert(
      fc.property(cells, (wanted) => {
        const grid = blockGrid();
        const car = vehicleIn(grid);
        const lights = new HeadlightBlocks(noCampSpace);
        lights.shine(asVehicleId(car.id), car, wanted);
        expect(wanted.map(grid.typeAt)).toEqual(
          wanted.map((c) => lightBlockId(c.level)),
        );
        lights.shine(asVehicleId(car.id), car, []);
        expect(wanted.map(grid.typeAt)).toEqual(
          wanted.map(() => "minecraft:air"),
        );
      }),
    );
  });

  it("leaves a block the player placed in the beam when the light moves away, and lights its cell again once it is mined (ADR 0020)", () => {
    fc.assert(
      fc.property(cells, (wanted) => {
        const grid = blockGrid();
        const car = vehicleIn(grid);
        const lights = new HeadlightBlocks(noCampSpace);
        lights.shine(asVehicleId(car.id), car, wanted);
        const [first, ...others] = wanted;
        const placed = defined(first, "first wanted cell");
        grid.getBlock(placed).setType("minecraft:stone");
        lights.shine(asVehicleId(car.id), car, []);
        expect(grid.typeAt(placed)).toBe("minecraft:stone");
        expect(others.map(grid.typeAt)).toEqual(
          others.map(() => "minecraft:air"),
        );
        expect(car.getDynamicProperty(LIT_CELLS_PROPERTY)).toBeUndefined();
        grid.getBlock(placed).setType("minecraft:air");
        lights.shine(asVehicleId(car.id), car, wanted);
        expect(wanted.map(grid.typeAt)).toEqual(
          wanted.map((c) => lightBlockId(c.level)),
        );
      }),
    );
  });

  it("clears the light of a vehicle that is no longer loaded and keeps the light of a loaded one (ADR 0038)", () => {
    fc.assert(
      fc.property(cells, (wanted) => {
        const grid = blockGrid();
        const car = vehicleIn(grid);
        const lights = new HeadlightBlocks(noCampSpace);
        lights.shine(asVehicleId(car.id), car, wanted);
        lights.clearGone(new Set([asVehicleId(car.id)]));
        expect(wanted.map(grid.typeAt)).toEqual(
          wanted.map((c) => lightBlockId(c.level)),
        );
        lights.clearGone(new Set());
        expect(wanted.map(grid.typeAt)).toEqual(
          wanted.map(() => "minecraft:air"),
        );
      }),
    );
  });

  it("turns the old dimension's light back into air and lights the new one when the vehicle changes dimension", () => {
    fc.assert(
      fc.property(cells, (wanted) => {
        const overworld = blockGrid();
        const nether = blockGrid();
        const car = vehicleIn(overworld);
        const lights = new HeadlightBlocks(noCampSpace);
        lights.shine(asVehicleId(car.id), car, wanted);
        Object.assign(car, {
          dimension: { id: "nether", getBlock: nether.getBlock },
        });
        lights.shine(asVehicleId(car.id), car, wanted);
        expect(wanted.map(overworld.typeAt)).toEqual(
          wanted.map(() => "minecraft:air"),
        );
        expect(wanted.map(nether.typeAt)).toEqual(
          wanted.map((c) => lightBlockId(c.level)),
        );
      }),
    );
  });

  it("lays each wanted cell again at its new level when its beam's level changes, and saves the new levels", () => {
    fc.assert(
      fc.property(cells, fc.integer({ min: 1, max: 15 }), (wanted, d) => {
        const grid = blockGrid();
        const car = vehicleIn(grid);
        const lights = new HeadlightBlocks(noCampSpace);
        lights.shine(asVehicleId(car.id), car, wanted);
        const changed = wanted.map((c) => ({
          ...c,
          level: (c.level + d) % 16,
        }));
        lights.shine(asVehicleId(car.id), car, changed);
        expect(changed.map(grid.typeAt)).toEqual(
          changed.map((c) => lightBlockId(c.level)),
        );
        expect(
          JSON.parse(car.getDynamicProperty(LIT_CELLS_PROPERTY) as string),
        ).toEqual(changed);
      }),
    );
  });

  it("clears the saved cells and their levels after a reload", () => {
    fc.assert(
      fc.property(cells, (wanted) => {
        const grid = blockGrid();
        const car = vehicleIn(grid);
        new HeadlightBlocks(noCampSpace).shine(
          asVehicleId(car.id),
          car,
          wanted,
        );
        new HeadlightBlocks(noCampSpace).shine(asVehicleId(car.id), car, []);
        expect(wanted.map(grid.typeAt)).toEqual(
          wanted.map(() => "minecraft:air"),
        );
        expect(car.getDynamicProperty(LIT_CELLS_PROPERTY)).toBeUndefined();
      }),
    );
  });

  it("reads a cell saved without a level as a level 15 light", () => {
    const grid = blockGrid();
    const car = vehicleIn(grid);
    const cell = { x: 0, y: 65, z: 0 };
    grid.getBlock(cell).setType(LIGHT_BLOCK);
    const saved = JSON.stringify([cell]);
    car.setDynamicProperty(LIT_CELLS_PROPERTY, saved);
    const lights = new HeadlightBlocks(noCampSpace);
    lights.shine(asVehicleId(car.id), car, [{ ...cell, level: 15 }]);
    expect(grid.typeAt(cell)).toBe(LIGHT_BLOCK);
    expect(car.getDynamicProperty(LIT_CELLS_PROPERTY)).toBe(saved);
    lights.shine(asVehicleId(car.id), car, [{ ...cell, level: 8 }]);
    expect(grid.typeAt(cell)).toBe("minecraft:light_block_8");
  });

  it("drops a saved cell whose level is not a light level", () => {
    const grid = blockGrid();
    const car = vehicleIn(grid);
    const invalid = [
      { x: 0, y: 65, z: 0, level: 16 },
      { x: 1, y: 65, z: 0, level: 2.5 },
    ];
    for (const c of invalid) grid.getBlock(c).setType(LIGHT_BLOCK);
    car.setDynamicProperty(LIT_CELLS_PROPERTY, JSON.stringify(invalid));
    new HeadlightBlocks(noCampSpace).shine(asVehicleId(car.id), car, []);
    expect(invalid.map(grid.typeAt)).toEqual(invalid.map(() => LIGHT_BLOCK));
  });

  it("drops saved entries that are not cells and clears the valid ones", () => {
    const grid = blockGrid();
    const car = vehicleIn(grid);
    const valid = { x: 0, y: 65, z: 0, level: 9 };
    const notCells = [
      { x: 1, y: 65.5, z: 0, level: 9 },
      { x: 2, y: 65, z: "0", level: 9 },
    ];
    for (const c of [valid, ...notCells]) {
      grid.getBlock({ x: c.x, y: Math.floor(c.y), z: 0 }).setType(LIGHT_BLOCK);
    }
    car.setDynamicProperty(
      LIT_CELLS_PROPERTY,
      JSON.stringify([null, "cell", 7, valid, ...notCells]),
    );
    new HeadlightBlocks(noCampSpace).shine(asVehicleId(car.id), car, []);
    expect(grid.typeAt(valid)).toBe("minecraft:air");
    expect(grid.typeAt({ x: 1, y: 65, z: 0 })).toBe(LIGHT_BLOCK);
    expect(grid.typeAt({ x: 2, y: 65, z: 0 })).toBe(LIGHT_BLOCK);
    expect(car.getDynamicProperty(LIT_CELLS_PROPERTY)).toBeUndefined();
  });

  it("ignores a saved value that is not a list of cells", () => {
    const lit = { x: 0, y: 65, z: 0, level: 15 };
    for (const saved of [JSON.stringify(lit), "not json"]) {
      const grid = blockGrid();
      const car = vehicleIn(grid);
      grid.getBlock(lit).setType(LIGHT_BLOCK);
      car.setDynamicProperty(LIT_CELLS_PROPERTY, saved);
      new HeadlightBlocks(noCampSpace).shine(asVehicleId(car.id), car, []);
      expect(grid.typeAt(lit)).toBe(LIGHT_BLOCK);
    }
  });

  it("does nothing for a gone vehicle it has not lit", () => {
    const lights = new HeadlightBlocks(noCampSpace);
    expect(() =>
      lights.shine(asVehicleId("gone"), undefined, []),
    ).not.toThrow();
  });
});

it("skips a wanted camp cell and lights the others (ADR 0129)", () => {
  const grid = blockGrid();
  const car = vehicleIn(grid);
  const wanted = [
    { x: 0, y: 65, z: 0, level: 15 },
    { x: 1, y: 65, z: 0, level: 15 },
  ];
  new HeadlightBlocks((_, at) => at.x === 0).shine(
    asVehicleId(car.id),
    car,
    wanted,
  );
  expect(wanted.map(grid.typeAt)).toEqual(["minecraft:air", LIGHT_BLOCK]);
});
