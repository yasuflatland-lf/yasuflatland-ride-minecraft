import fc from "fast-check";
import { expect, it, vi } from "vitest";
import { placeOnTableTop } from "../../../src/application/camp/placeOnTableTop";
import type {
  HostedItemKind,
  TableTopWorld,
} from "../../../src/application/camp/ports/tableTop";
import { decodeHost } from "../../../src/domain/camp/hosted";
import {
  TABLE_TOP_HALF_PX,
  TABLE_TOP_LIMIT,
  TABLE_TOP_PX,
} from "../../../src/domain/camp/spec";
import type { TopItem } from "../../../src/domain/camp/tabletop";
import { asDimensionId, asPlayerId } from "../../../src/domain/shared/ids";
import type { Vec3 } from "../../../src/domain/shared/vec";
import { defined } from "../../support/defined";

const player = asPlayerId("player");
const dimension = asDimensionId("overworld");
const kind: HostedItemKind = {
  id: "dutch_oven",
  footprint: { halfX: 4, halfZ: 3 },
  clearance: 2,
};
const command = { player, table: "table", slot: 2 };

function fixture(
  overrides: Partial<Omit<TableTopWorld, "spawnHostedOnTable">> = {},
) {
  const world = {
    table: () => ({ dimension, at: { x: 10.5, y: 64, z: 20.5 }, yaw: 0 }),
    itemsOnTable: (): readonly TopItem[] => [],
    isAir: vi.fn(() => true),
    isOwnBlock: () => false,
    isVehicleSpace: () => false,
    isCreative: () => false,
    consumeItem: vi.fn(() => true),
    ...overrides,
    spawnHostedOnTable: vi.fn<TableTopWorld["spawnHostedOnTable"]>(),
  } satisfies TableTopWorld;
  return world;
}

function spawnedAt(world: ReturnType<typeof fixture>) {
  const call = world.spawnHostedOnTable.mock.calls[0];
  const host = decodeHost(String(call?.[4]));
  return host.kind === "camp_table" ? host.at : undefined;
}

const pixels = fc.integer({ min: -4000, max: 4000 }).map((v) => v / 100);

it("stands the item at the aim clamped so its footprint stays on the top", () => {
  fc.assert(
    fc.property(pixels, pixels, (x, z) => {
      const world = fixture();
      expect(placeOnTableTop(world, kind, { ...command, aim: { x, z } })).toBe(
        "placed",
      );
      const limitX = TABLE_TOP_HALF_PX.halfX - kind.footprint.halfX;
      const limitZ = TABLE_TOP_HALF_PX.halfZ - kind.footprint.halfZ;
      expect(spawnedAt(world)).toEqual({
        x: Math.min(limitX, Math.max(-limitX, x)),
        z: Math.min(limitZ, Math.max(-limitZ, z)),
      });
    }),
  );
});

it("spawns the given kind at the table's world point and yaw, with a host marker naming the table", () => {
  const world = fixture({
    table: () => ({ dimension, at: { x: 10.5, y: 64, z: 20.5 }, yaw: 90 }),
  });
  placeOnTableTop(world, kind, { ...command, aim: { x: 8, z: 0 } });
  const [id, dim, at, yaw, host] = defined(
    world.spawnHostedOnTable.mock.calls[0],
    "spawn",
  );
  expect([id, dim, yaw, host]).toEqual([
    "dutch_oven",
    dimension,
    90,
    "camp_table:table:@8,0",
  ]);
  expect(at.x).toBeCloseTo(10.5);
  expect(at.y).toBeCloseTo(64 + TABLE_TOP_PX / 16);
  expect(at.z).toBeCloseTo(20.5 + 8 / 16);
});

it("aims at the middle of the top when the view misses it", () => {
  const world = fixture();
  expect(placeOnTableTop(world, kind, command)).toBe("placed");
  expect(spawnedAt(world)).toEqual({ x: 0, z: 0 });
});

it("refuses overlap, a full top, and an item too big for it, consuming nothing", () => {
  const item = (x: number): TopItem => ({
    at: { x, z: 0 },
    footprint: kind.footprint,
  });
  fc.assert(
    fc.property(
      fc.integer({ min: -7, max: 7 }),
      fc.boolean(),
      (offset, creative) => {
        for (const [overrides, itemKind, outcome] of [
          [{ itemsOnTable: () => [item(offset)] }, kind, "overlap"],
          [
            {
              itemsOnTable: () =>
                Array.from({ length: TABLE_TOP_LIMIT }, (_, i) =>
                  item(100 + 10 * i),
                ),
            },
            kind,
            "full",
          ],
          [
            {},
            {
              ...kind,
              footprint: { halfX: 4, halfZ: TABLE_TOP_HALF_PX.halfZ + 1 },
            },
            "tooBig",
          ],
        ] as const) {
          const world = fixture({ ...overrides, isCreative: () => creative });
          expect(
            placeOnTableTop(world, itemKind, {
              ...command,
              aim: { x: 0, z: 0 },
            }),
          ).toBe(outcome);
          expect(world.consumeItem).not.toHaveBeenCalled();
          expect(world.spawnHostedOnTable).not.toHaveBeenCalled();
        }
      },
    ),
  );
});

it("lets footprints touch along an edge", () => {
  const world = fixture({
    itemsOnTable: () => [{ at: { x: -4, z: 0 }, footprint: kind.footprint }],
  });
  expect(
    placeOnTableTop(world, kind, { ...command, aim: { x: 4, z: 0 } }),
  ).toBe("placed");
});

it("pays only on success, and Creative or the test hook pays nothing", () => {
  fc.assert(
    fc.property(fc.boolean(), fc.boolean(), (creative, hook) => {
      const world = fixture({ isCreative: () => creative });
      const cmd = hook ? { table: "table", slot: 2 } : command;
      expect(placeOnTableTop(world, kind, cmd)).toBe("placed");
      expect(world.consumeItem).toHaveBeenCalledTimes(creative || hook ? 0 : 1);
      if (!creative && !hook)
        expect(world.consumeItem).toHaveBeenCalledWith(player, 2);
    }),
  );
  const unpaid = fixture({ consumeItem: vi.fn(() => false) });
  expect(placeOnTableTop(unpaid, kind, command)).toBe("refused");
  expect(unpaid.spawnHostedOnTable).not.toHaveBeenCalled();
});

it("refuses a blocked or vehicle-occupied clearance cell above the item before paying", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: kind.clearance - 1 }),
      fc.boolean(),
      fc.constantFrom(-8, 8),
      (dy, vehicle, x) => {
        // The table stands at x 10.5 with yaw 0, so local x maps to world x.
        const blockedX = Math.floor(10.5 + x / 16);
        const blocked = (at: Vec3) =>
          at.x === blockedX && at.y === 64 + dy && at.z === 20;
        const world = fixture(
          vehicle
            ? { isVehicleSpace: (_d, at) => blocked(at) }
            : { isAir: vi.fn((_d, at) => !blocked(at)) },
        );
        expect(
          placeOnTableTop(world, kind, { ...command, aim: { x, z: 0 } }),
        ).toBe("refused");
        expect(world.consumeItem).not.toHaveBeenCalled();
        expect(world.spawnHostedOnTable).not.toHaveBeenCalled();
        const other = fixture(
          vehicle
            ? { isVehicleSpace: (_d, at) => blocked(at) }
            : { isAir: vi.fn((_d, at) => !blocked(at)) },
        );
        expect(
          placeOnTableTop(other, kind, { ...command, aim: { x: -x, z: 0 } }),
        ).toBe("placed");
      },
    ),
  );
});

it("refuses a missing table", () => {
  const world = fixture({ table: () => undefined });
  expect(placeOnTableTop(world, kind, command)).toBe("refused");
  expect(world.consumeItem).not.toHaveBeenCalled();
  expect(world.spawnHostedOnTable).not.toHaveBeenCalled();
});
