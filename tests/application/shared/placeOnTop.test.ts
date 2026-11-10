import fc from "fast-check";
import { expect, it, vi } from "vitest";
import type { TopHostWorld } from "../../../src/application/shared/placeOnTop";
import { placeOnTop } from "../../../src/application/shared/placeOnTop";
import type { HostedItemKind } from "../../../src/application/shared/ports/hostedItem";
import {
  CAMP_TABLE_TOP,
  TABLE_TOP_HALF_PX,
  TABLE_TOP_LIMIT,
  TABLE_TOP_PX,
} from "../../../src/domain/camp/spec";
import { asTableId } from "../../../src/domain/camp/table";
import { decodeHost, encodeHost } from "../../../src/domain/shared/hosted";
import { asDimensionId, asPlayerId } from "../../../src/domain/shared/ids";
import type { TopItem } from "../../../src/domain/shared/tableTop";
import type { Vec3 } from "../../../src/domain/shared/vec";
import { defined } from "../../support/defined";

const player = asPlayerId("player");
const dimension = asDimensionId("overworld");
const kind: HostedItemKind = {
  id: "dutch_oven",
  footprint: { halfX: 4, halfZ: 3 },
  clearance: 2,
};
const command = {
  player,
  hostType: "camp_table",
  host: asTableId("table"),
  slot: 2,
};

function fixture(overrides: Partial<Omit<TopHostWorld, "spawnHosted">> = {}) {
  const world = {
    topHost: () => ({ dimension, at: { x: 10.5, y: 64, z: 20.5 }, yaw: 0 }),
    itemsOnTop: (): readonly TopItem[] => [],
    isAir: vi.fn(() => true),
    isOwnBlock: () => false,
    isVehicleSpace: () => false,
    isCreative: () => false,
    consumeItem: vi.fn(() => true),
    ...overrides,
    spawnHosted: vi.fn<TopHostWorld["spawnHosted"]>(),
  } satisfies TopHostWorld;
  return world;
}

function spawnedAt(world: ReturnType<typeof fixture>) {
  const call = world.spawnHosted.mock.calls[0];
  const host = decodeHost(String(call?.[4]));
  return host.kind === "top" && host.hostType === "camp_table"
    ? host.at
    : undefined;
}

const pixels = fc.integer({ min: -4000, max: 4000 }).map((v) => v / 100);

it("stands the item at the aim clamped so its footprint stays on the top", () => {
  fc.assert(
    fc.property(pixels, pixels, (x, z) => {
      const world = fixture();
      expect(
        placeOnTop(world, CAMP_TABLE_TOP, kind, { ...command, aim: { x, z } }),
      ).toBe("placed");
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
    topHost: () => ({ dimension, at: { x: 10.5, y: 64, z: 20.5 }, yaw: 90 }),
  });
  placeOnTop(world, CAMP_TABLE_TOP, kind, { ...command, aim: { x: 8, z: 0 } });
  const [id, dim, at, yaw, host] = defined(
    world.spawnHosted.mock.calls[0],
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
  expect(placeOnTop(world, CAMP_TABLE_TOP, kind, command)).toBe("placed");
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
          [{ itemsOnTop: () => [item(offset)] }, kind, "overlap"],
          [
            {
              itemsOnTop: () =>
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
            placeOnTop(world, CAMP_TABLE_TOP, itemKind, {
              ...command,
              aim: { x: 0, z: 0 },
            }),
          ).toBe(outcome);
          expect(world.consumeItem).not.toHaveBeenCalled();
          expect(world.spawnHosted).not.toHaveBeenCalled();
        }
      },
    ),
  );
});

it("lets footprints touch along an edge", () => {
  const world = fixture({
    itemsOnTop: () => [{ at: { x: -4, z: 0 }, footprint: kind.footprint }],
  });
  expect(
    placeOnTop(world, CAMP_TABLE_TOP, kind, {
      ...command,
      aim: { x: 4, z: 0 },
    }),
  ).toBe("placed");
});

it("pays only on success, and Creative or the test hook pays nothing", () => {
  fc.assert(
    fc.property(fc.boolean(), fc.boolean(), (creative, hook) => {
      const world = fixture({ isCreative: () => creative });
      const cmd = hook
        ? { hostType: "camp_table", host: asTableId("table"), slot: 2 }
        : command;
      expect(placeOnTop(world, CAMP_TABLE_TOP, kind, cmd)).toBe("placed");
      expect(world.consumeItem).toHaveBeenCalledTimes(creative || hook ? 0 : 1);
      if (!creative && !hook)
        expect(world.consumeItem).toHaveBeenCalledWith(player, 2);
    }),
  );
  const unpaid = fixture({ consumeItem: vi.fn(() => false) });
  expect(placeOnTop(unpaid, CAMP_TABLE_TOP, kind, command)).toBe("refused");
  expect(unpaid.spawnHosted).not.toHaveBeenCalled();
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
          placeOnTop(world, CAMP_TABLE_TOP, kind, {
            ...command,
            aim: { x, z: 0 },
          }),
        ).toBe("refused");
        expect(world.consumeItem).not.toHaveBeenCalled();
        expect(world.spawnHosted).not.toHaveBeenCalled();
        const other = fixture(
          vehicle
            ? { isVehicleSpace: (_d, at) => blocked(at) }
            : { isAir: vi.fn((_d, at) => !blocked(at)) },
        );
        expect(
          placeOnTop(other, CAMP_TABLE_TOP, kind, {
            ...command,
            aim: { x: -x, z: 0 },
          }),
        ).toBe("placed");
      },
    ),
  );
});

it("refuses a missing table", () => {
  const world = fixture({ topHost: () => undefined });
  expect(placeOnTop(world, CAMP_TABLE_TOP, kind, command)).toBe("refused");
  expect(world.consumeItem).not.toHaveBeenCalled();
  expect(world.spawnHosted).not.toHaveBeenCalled();
});

it("uses the supplied surface and host type for placement and clearance", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 4, max: 30 }),
      fc.integer({ min: 3, max: 30 }),
      fc.integer({ min: 0, max: 64 }),
      fc.constantFrom(0 as const, 1 as const),
      fc.integer({ min: 0, max: 5 }),
      fc.integer({ min: 0, max: 4 }),
      pixels,
      pixels,
      (halfX, halfZ, topPx, clearanceBase, limit, count, x, z) => {
        const surface = { half: { halfX, halfZ }, topPx, clearanceBase, limit };
        const topHost = vi.fn(() => ({
          dimension,
          at: { x: 10.5, y: 64, z: 20.5 },
          yaw: 0,
        }));
        const itemsOnTop = vi.fn(() =>
          Array.from({ length: count }, () => ({
            at: { x: 100, z: 100 },
            footprint: kind.footprint,
          })),
        );
        const isAir = vi.fn(() => true);
        const world = fixture({ topHost, itemsOnTop, isAir });
        const cmd = { ...command, hostType: "test_top", aim: { x, z } };
        expect(placeOnTop(world, surface, kind, cmd)).toBe(
          count >= limit ? "full" : "placed",
        );
        expect(topHost).toHaveBeenCalledWith("test_top", cmd.host);
        expect(itemsOnTop).toHaveBeenCalledWith("test_top", cmd.host);
        if (count >= limit) {
          expect(world.spawnHosted).not.toHaveBeenCalled();
          return;
        }
        const at = {
          x: Math.min(
            halfX - kind.footprint.halfX,
            Math.max(-halfX + kind.footprint.halfX, x),
          ),
          z: Math.min(
            halfZ - kind.footprint.halfZ,
            Math.max(-halfZ + kind.footprint.halfZ, z),
          ),
        };
        const worldAt = {
          x: 10.5 + at.x / 16,
          y: 64 + topPx / 16,
          z: 20.5 + at.z / 16,
        };
        expect(world.spawnHosted).toHaveBeenCalledExactlyOnceWith(
          kind.id,
          dimension,
          worldAt,
          0,
          encodeHost({ kind: "top", hostType: "test_top", id: cmd.host, at }),
        );
        expect(isAir.mock.calls).toEqual(
          Array.from({ length: kind.clearance }, (_, dy) => [
            dimension,
            {
              x: Math.floor(worldAt.x),
              y: 64 + clearanceBase + dy,
              z: Math.floor(worldAt.z),
            },
          ]),
        );
      },
    ),
  );
});

it("checks host obstruction at the clamped footprint before payment or clearance", () => {
  fc.assert(
    fc.property(pixels, pixels, fc.boolean(), (x, z, blocked) => {
      const blockedAt = vi.fn(() => blocked);
      const world = fixture({
        topHost: () => ({
          dimension,
          at: { x: 0, y: 64, z: 0 },
          yaw: 0,
          blockedAt,
        }),
      });
      expect(
        placeOnTop(world, CAMP_TABLE_TOP, kind, { ...command, aim: { x, z } }),
      ).toBe(blocked ? "overlap" : "placed");
      expect(blockedAt).toHaveBeenCalledWith(
        {
          x: Math.min(
            TABLE_TOP_HALF_PX.halfX - kind.footprint.halfX,
            Math.max(-TABLE_TOP_HALF_PX.halfX + kind.footprint.halfX, x),
          ),
          z: Math.min(
            TABLE_TOP_HALF_PX.halfZ - kind.footprint.halfZ,
            Math.max(-TABLE_TOP_HALF_PX.halfZ + kind.footprint.halfZ, z),
          ),
        },
        kind.footprint,
      );
      expect(world.consumeItem).toHaveBeenCalledTimes(blocked ? 0 : 1);
      expect(world.spawnHosted).toHaveBeenCalledTimes(blocked ? 0 : 1);
      if (blocked) expect(world.isAir).not.toHaveBeenCalled();
    }),
  );
});
