import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { PlaceBeachChair } from "../../../src/application/resort/placeBeachChair";
import { PlaceFurniture } from "../../../src/application/resort/placeFurniture";
import {
  beachChairCells,
  beachChairOrigin,
  beachChairPose,
} from "../../../src/domain/resort/beachChair";
import {
  FURNITURE_SPEC,
  type FurnitureKind,
  furnitureCells,
  furnitureClearCells,
  furniturePose,
  furnitureSupportCells,
} from "../../../src/domain/resort/furniture";
import type { BlockFace } from "../../../src/domain/shared/blockFace";
import {
  type Cell,
  cellKey,
  cellOf,
  sameCell,
} from "../../../src/domain/shared/cells";
import { asDimensionId, asPlayerId } from "../../../src/domain/shared/ids";
import { distance3, type Vec3 } from "../../../src/domain/shared/vec";
import { fakeBeachChairWorld } from "./fakeBeachChairWorld";
import { fakeFurnitureWorld } from "./fakeFurnitureWorld";

const furnitureKinds = Object.keys(FURNITURE_SPEC) as FurnitureKind[];

describe.each(furnitureKinds)("%s", (kind) => {
  const command = fc.record({
    kind: fc.constant(kind),
    player: fc.constant(asPlayerId("p")),
    dimension: fc.constant(asDimensionId("overworld")),
    block: fc
      .record({
        x: fc.integer({ min: -1000, max: 1000 }),
        y: fc.integer({ min: 0, max: 200 }),
        z: fc.integer({ min: -1000, max: 1000 }),
      })
      .map(cellOf),
    face: fc.constant<BlockFace>("up"),
    yaw: fc.integer({ min: -360, max: 360 }),
    slot: fc.integer({ min: 0, max: 8 }),
  });
  it("rejects every placement obstruction before payment or spawn", () => {
    fc.assert(
      fc.property(command, fc.integer({ min: 0, max: 2 }), (cmd, reason) => {
        const world = fakeFurnitureWorld(kind);
        if (reason === 0) cmd.face = "down";
        if (reason === 1) world.isOwnBlock.mockReturnValue(true);
        if (reason === 2) world.isSolidTop.mockReturnValue(false);
        expect(new PlaceFurniture(world).execute(cmd)).toBe(false);
        expect(world.payment.consumeItem).not.toHaveBeenCalled();
        expect(world.spawn).not.toHaveBeenCalled();
        expect(world.showBlocked).toHaveBeenCalledExactlyOnceWith(cmd.player);
      }),
    );
  });
  it("pays for the requested kind and lays its top only after a successful spawn", () => {
    const cmd = {
      kind,
      player: asPlayerId("p"),
      dimension: asDimensionId("overworld"),
      block: cellOf({ x: 10, y: 20, z: 30 }),
      face: "up" as const,
      yaw: 0,
      slot: 2,
    };
    const world = fakeFurnitureWorld(kind);
    const place = new PlaceFurniture(world);
    expect(place.execute(cmd)).toBe(true);
    expect(world.paymentFor).toHaveBeenCalledExactlyOnceWith(kind);
    expect(world.payment.consumeItem).toHaveBeenCalledExactlyOnceWith(
      cmd.player,
      cmd.slot,
    );
    expect(world.spawn).toHaveBeenCalledExactlyOnceWith(
      cmd.dimension,
      furniturePose(cmd.block, cmd.yaw, kind),
    );
    if (FURNITURE_SPEC[kind].top) {
      expect(world.layTop).toHaveBeenCalledExactlyOnceWith(
        world.spawn.mock.results[0]?.value,
      );
      expect(world.spawn).toHaveBeenCalledBefore(world.layTop);
    } else {
      expect(world.layTop).not.toHaveBeenCalled();
    }

    world.layTop.mockClear();
    world.spawn.mockReturnValue(undefined);
    expect(place.execute(cmd)).toBe(false);
    expect(world.payment.refund).toHaveBeenCalledExactlyOnceWith(
      cmd.player,
      cmd.slot,
    );
    expect(world.showBlocked).toHaveBeenCalledExactlyOnceWith(cmd.player);
    expect(world.layTop).not.toHaveBeenCalled();

    world.showBlocked.mockClear();
    world.spawn.mockClear();
    world.payment.consumeItem.mockReturnValue(false);
    expect(place.execute(cmd)).toBe(false);
    expect(world.showBlocked).toHaveBeenCalledExactlyOnceWith(cmd.player);
    expect(world.spawn).not.toHaveBeenCalled();
    expect(world.layTop).not.toHaveBeenCalled();
  });

  it("rejects an obstruction over any of the footprint cells before charging", () => {
    fc.assert(
      fc.property(command, fc.nat(), (cmd, index) => {
        const cells = furnitureClearCells(
          furniturePose(cmd.block, cmd.yaw, kind),
        );
        const obstruction = cells[index % cells.length];
        if (!obstruction) throw Error("empty footprint");
        for (const check of [
          "isAir",
          "isVehicleSpace",
          "isCampSpace",
        ] as const) {
          const world = fakeFurnitureWorld(kind);
          world[check].mockImplementation((_dimension, cell) =>
            check === "isAir"
              ? cellKey(cell) !== cellKey(obstruction)
              : cellKey(cell) === cellKey(obstruction),
          );
          expect(new PlaceFurniture(world).execute(cmd)).toBe(false);
          expect(world.payment.consumeItem).not.toHaveBeenCalled();
          expect(world.spawn).not.toHaveBeenCalled();
        }
      }),
    );
  });
  it("requires solid support below every footprint cell", () => {
    fc.assert(
      fc.property(command, (cmd) => {
        for (const support of furnitureSupportCells(
          furniturePose(cmd.block, cmd.yaw, kind),
        )) {
          const world = fakeFurnitureWorld(kind);
          world.isSolidTop.mockImplementation(
            (_dimension, cell) => cellKey(cell) !== cellKey(support),
          );
          expect(new PlaceFurniture(world).execute(cmd)).toBe(false);
          expect(world.payment.consumeItem).not.toHaveBeenCalled();
          expect(world.spawn).not.toHaveBeenCalled();
        }
      }),
    );
  });
});

it("accepts a second resort placement only when its footprint is disjoint", () => {
  const kind = fc.constantFrom(...furnitureKinds, "beach_chair" as const);
  const heading = fc.constantFrom(0, 90, 180, 270);
  const offset = fc
    .record({
      x: fc.integer({ min: -2, max: 2 }),
      y: fc.constantFrom(0, 0, 0, -1, 1),
      z: fc.integer({ min: -2, max: 2 }),
    })
    .map(cellOf);
  fc.assert(
    fc.property(
      kind,
      kind,
      heading,
      heading,
      offset,
      (first, second, a, b, offset) => {
        const placed: { origin: Vec3; cells: readonly Cell[] }[] = [];
        const occupiedNear = (_dimension: string, near: Vec3, radius: number) =>
          placed
            .filter(({ origin }) => distance3(near, origin) <= radius)
            .flatMap(({ cells }) => cells);
        const cmd = {
          player: asPlayerId("p"),
          dimension: asDimensionId("overworld"),
          face: "up" as const,
          slot: 0,
        };
        function attempt(
          kind: FurnitureKind | "beach_chair",
          block: Cell,
          yaw: number,
        ) {
          if (kind === "beach_chair") {
            const pose = beachChairPose(block, yaw);
            const world = fakeBeachChairWorld();
            world.resortGearCells.mockImplementation(occupiedNear);
            return {
              footprint: {
                origin: beachChairOrigin(pose),
                cells: beachChairCells(pose),
              },
              consumeItem: world.consumeItem,
              world,
              accepted: new PlaceBeachChair(world).execute({
                ...cmd,
                block,
                yaw,
              }),
            };
          }
          const pose = furniturePose(block, yaw, kind);
          const world = fakeFurnitureWorld(kind);
          world.resortGearCells.mockImplementation(occupiedNear);
          return {
            consumeItem: world.payment.consumeItem,
            footprint: { origin: pose.origin, cells: furnitureCells(pose) },
            world,
            accepted: new PlaceFurniture(world).execute({
              ...cmd,
              block,
              yaw,
              kind,
            }),
          };
        }
        const initial = attempt(first, cellOf({ x: 0, y: 0, z: 0 }), a);
        expect(initial.accepted).toBe(true);
        placed.push(initial.footprint);
        const next = attempt(second, offset, b);
        const intersects = next.footprint.cells.some((cell) =>
          initial.footprint.cells.some((occupied) => sameCell(cell, occupied)),
        );
        expect(next.accepted).toBe(!intersects);
        if (intersects) {
          expect(next.world.showBlocked).toHaveBeenCalledExactlyOnceWith(
            cmd.player,
          );
          expect(next.consumeItem).not.toHaveBeenCalled();
          expect(next.world.spawn).not.toHaveBeenCalled();
        }
      },
    ),
    {
      numRuns: 500,
      examples: [
        ["beach_chair", "beach_chair", 0, 0, cellOf({ x: 0, y: 0, z: 2 })],
      ],
    },
  );
});
