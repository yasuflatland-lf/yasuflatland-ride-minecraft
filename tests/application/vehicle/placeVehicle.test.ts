import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import {
  PlaceVehicle,
  type PlaceVehicleCommand,
} from "../../../src/application/vehicle/placeVehicle";
import {
  asDimensionId,
  asPlayerId,
  asVehicleId,
} from "../../../src/domain/shared/ids";
import { VEHICLE_KINDS } from "../../../src/domain/vehicle/kind";
import { profileOf } from "../../../src/domain/vehicle/kinds/index";
import {
  type BlockFace,
  placementCell,
} from "../../../src/domain/vehicle/placement/placement";
import { FakeWorld, InMemoryRepo } from "./fakes";

const log = { warn: () => {} };

const cmd: PlaceVehicleCommand = {
  kind: "suv",
  playerId: asPlayerId("p"),
  dimensionId: asDimensionId("minecraft:overworld"),
  blockLocation: { x: 10, y: 64, z: -3 },
  yaw: 45,
  slot: 2,
};

describe("PlaceVehicle (ADR 0008)", () => {
  it("records the placing player as the owner of each vehicle (ADR 0066)", () => {
    fc.assert(
      fc.property(
        fc.array(fc.string().map(asPlayerId), { minLength: 1 }),
        fc.constantFrom(...VEHICLE_KINDS),
        fc.boolean(),
        (playerIds, kind, creative) => {
          const world = new FakeWorld();
          const placement = new PlaceVehicle(world, new InMemoryRepo(), log);
          if (creative)
            for (const playerId of playerIds)
              world.creativePlayers.add(playerId);
          for (const playerId of playerIds)
            expect(placement.execute({ ...cmd, playerId, kind })).toBe(true);
          expect([...world.owners.values()]).toEqual(playerIds);
        },
      ),
    );
  });

  it("consumes one item of the command's kind from the slot it was used from, then places a vehicle on the block and saves the aggregate", () => {
    const world = new FakeWorld();
    const repo = new InMemoryRepo();
    expect(new PlaceVehicle(world, repo, log).execute(cmd)).toBe(true);
    expect(world.calls).toEqual([
      "consume:p:2:suv",
      "spawn:minecraft:overworld:10.5,65,-2.5:45:suv",
    ]);
    expect(repo.get(asVehicleId("v1"))?.kind).toBe(cmd.kind);
    expect(repo.get(asVehicleId("v1"))?.yaw).toBeCloseTo(45);
  });

  it("does not place the vehicle or consume the item when there is no room, such as under a low ceiling", () => {
    const world = new FakeWorld();
    world.air = (at) => !(at.y === 66 && at.x === 10 && at.z === -3);
    expect(new PlaceVehicle(world, new InMemoryRepo(), log).execute(cmd)).toBe(
      false,
    );
    expect(world.calls).toEqual([]);
    expect(world.owners.size).toBe(0);
  });
});

describe("PlaceVehicle placement gift (ADR 0093)", () => {
  const giftCalls = (world: FakeWorld) =>
    world.calls.filter((c) => c.startsWith("gift:"));

  it("gives the kind's gift once after the first placement, in any game mode", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...VEHICLE_KINDS),
        fc.boolean(),
        (kind, creative) => {
          const world = new FakeWorld();
          if (creative) world.creativePlayers.add("p");
          const placement = new PlaceVehicle(world, new InMemoryRepo(), log);
          placement.execute({ ...cmd, kind });
          placement.execute({ ...cmd, kind });
          const gift = profileOf(kind).placementGift;
          if (gift === undefined) {
            expect(giftCalls(world)).toEqual([]);
            return;
          }
          expect(giftCalls(world)).toEqual([`gift:p:${gift}`]);
          const at = world.calls.indexOf(`gift:p:${gift}`);
          expect(world.calls[at + 1]).toBe(`markGift:p:${gift}`);
          const firstSpawn = world.calls.findIndex((c) =>
            c.startsWith("spawn:"),
          );
          expect(firstSpawn).toBeGreaterThanOrEqual(0);
          expect(firstSpawn).toBeLessThan(at);
        },
      ),
    );
  });

  it("gives the box with the camper, after consuming the item and spawning", () => {
    const world = new FakeWorld();
    expect(
      new PlaceVehicle(world, new InMemoryRepo(), log).execute({
        ...cmd,
        kind: "camper",
      }),
    ).toBe(true);
    expect(world.calls).toEqual([
      "consume:p:2:camper",
      "spawn:minecraft:overworld:10.5,65,-2.5:45:camper",
      "gift:p:camping_gear_box",
      "markGift:p:camping_gear_box",
    ]);
  });

  it("gives each player their own box", () => {
    const world = new FakeWorld();
    const placement = new PlaceVehicle(world, new InMemoryRepo(), log);
    for (const playerId of ["p", "q"].map(asPlayerId)) {
      placement.execute({ ...cmd, kind: "camper", playerId });
      placement.execute({ ...cmd, kind: "camper", playerId });
    }
    expect(giftCalls(world)).toEqual([
      "gift:p:camping_gear_box",
      "gift:q:camping_gear_box",
    ]);
  });

  it.each([
    [
      "the slot no longer holds the item",
      (world: FakeWorld) => {
        world.itemInSlot = false;
      },
    ],
    [
      "a block is in the way",
      (world: FakeWorld) => {
        world.air = (at) => !(at.y === 66 && at.x === 10 && at.z === -3);
      },
    ],
  ])("gives no box when the placement fails because %s", (_, setUp) => {
    const world = new FakeWorld();
    setUp(world);
    expect(
      new PlaceVehicle(world, new InMemoryRepo(), log).execute({
        ...cmd,
        kind: "camper",
      }),
    ).toBe(false);
    expect(
      world.calls.some(
        (c) => c.startsWith("gift:") || c.startsWith("markGift:"),
      ),
    ).toBe(false);
  });

  it("gives no box to a player who left", () => {
    const world = new FakeWorld();
    world.absentPlayers.add("p");
    expect(
      new PlaceVehicle(world, new InMemoryRepo(), log).execute({
        ...cmd,
        kind: "camper",
      }),
    ).toBe(true);
    expect(
      world.calls.some(
        (c) => c.startsWith("gift:") || c.startsWith("markGift:"),
      ),
    ).toBe(false);
  });
});

const FACES: BlockFace[] = ["up", "down", "north", "south", "east", "west"];
const cellArb = fc.record({
  x: fc.integer({ min: -64, max: 64 }),
  y: fc.integer({ min: -60, max: 300 }),
  z: fc.integer({ min: -64, max: 64 }),
});

describe("PlaceVehicle placement cell (ADR 0050, ADR 0051)", () => {
  it("picks the same cell as the kind's placement rule with the world's liquids, querying only the given dimension", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...VEHICLE_KINDS),
        cellArb,
        fc.constantFrom(...FACES),
        fc.integer({ min: 0, max: 20 }),
        fc.constantFrom("water", "lava"),
        fc.string({ minLength: 1 }).map(asDimensionId),
        (kind, clicked, face, depth, liquid, dimensionId) => {
          const world = new FakeWorld();
          const placement = new PlaceVehicle(world, new InMemoryRepo(), log);
          world.water = (at) =>
            at.x === clicked.x &&
            at.z === clicked.z &&
            at.y > clicked.y &&
            at.y <= clicked.y + depth;
          world.lava = liquid === "lava" ? world.water : () => false;
          if (liquid === "lava") world.water = () => false;
          const lava = vi.spyOn(world, "isLavaAt");
          const cell = placement.cellFor(kind, dimensionId, clicked, face);
          expect(cell).toEqual(
            placementCell(
              profileOf(kind).placement,
              clicked,
              face,
              (at, queried) =>
                queried === "water" ? world.water(at) : world.lava(at),
            ),
          );
          expect(
            lava.mock.calls.every(([dimension]) => dimension === dimensionId),
          ).toBe(true);
          expect(world.waterDimensions.every((d) => d === dimensionId)).toBe(
            true,
          );
          expect(world.waterDimensions.length > 0).toBe(
            profileOf(kind).placement.surfaces.includes("water"),
          );
          expect(world.calls).toEqual([]);
          expect(world.owners.size).toBe(0);
        },
      ),
    );
  });

  it("accepts view-ray liquids exactly as declared by each kind's profile", () => {
    const placement = new PlaceVehicle(
      new FakeWorld(),
      new InMemoryRepo(),
      log,
    );
    fc.assert(
      fc.property(fc.constantFrom(...VEHICLE_KINDS), (kind) => {
        const { liquids } = profileOf(kind).placement;
        expect(placement.placesOnLiquid(kind)).toBe(liquids.size > 0);
        for (const liquid of ["water", "lava"] as const)
          expect(placement.placesOn(kind, liquid)).toBe(liquids.has(liquid));
      }),
    );
  });
});

it("places only when creative or the item remains in the original slot", () => {
  fc.assert(
    fc.property(
      fc.constantFrom(...VEHICLE_KINDS),
      fc.boolean(),
      fc.boolean(),
      (kind, creative, itemInSlot) => {
        const world = new FakeWorld();
        const repo = new InMemoryRepo();
        world.itemInSlot = itemInSlot;
        if (creative) world.creativePlayers.add("p");
        expect(
          new PlaceVehicle(world, repo, log).execute({
            ...cmd,
            kind,
          }),
        ).toBe(creative || itemInSlot);
        expect(world.calls.filter((c) => c.startsWith("consume"))).toEqual(
          !creative && itemInSlot ? [`consume:p:2:${kind}`] : [],
        );
        if (!creative && !itemInSlot) {
          expect(world.calls).toEqual([]);
          expect(repo.ids()).toEqual([]);
          expect(world.owners.size).toBe(0);
        }
      },
    ),
  );
});

const clearanceCell = fc.constantFrom(...VEHICLE_KINDS).chain((kind) => {
  const { halfX, height, halfZ } = profileOf(kind).placement.clearance;
  return fc.tuple(
    fc.constant(kind),
    fc.record({
      x: fc.integer({ min: -halfX, max: halfX }),
      y: fc.integer({ min: 1, max: height }),
      z: fc.integer({ min: -halfZ, max: halfZ }),
    }),
  );
});

describe("PlaceVehicle and camp space (ADR 0129)", () => {
  it("refuses any camp cell inside the clearance before reading its block or consuming or spawning", () => {
    fc.assert(
      fc.property(clearanceCell, fc.boolean(), ([kind, offset], creative) => {
        const world = new FakeWorld();
        const repo = new InMemoryRepo();
        if (creative) world.creativePlayers.add(cmd.playerId);
        const claimed = {
          x: cmd.blockLocation.x + offset.x,
          y: cmd.blockLocation.y + offset.y,
          z: cmd.blockLocation.z + offset.z,
        };
        const matches = (at: typeof claimed) =>
          at.x === claimed.x && at.y === claimed.y && at.z === claimed.z;
        world.campSpace = (_, at) => matches(at);
        world.air = (at) => {
          expect(matches(at)).toBe(false);
          return true;
        };
        expect(
          new PlaceVehicle(world, repo, log).execute({ ...cmd, kind }),
        ).toBe(false);
        expect(world.calls).toEqual([]);
        expect(repo.ids()).toEqual([]);
      }),
    );
  });

  it("allows camp cells only outside the clearance box", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...VEHICLE_KINDS).chain((kind) => {
          const { halfX, height, halfZ } = profileOf(kind).placement.clearance;
          const x = fc.integer({ min: -halfX, max: halfX });
          const y = fc.integer({ min: 1, max: height });
          const z = fc.integer({ min: -halfZ, max: halfZ });
          return fc.tuple(
            fc.constant(kind),
            fc.array(
              fc.oneof(
                fc.record({ x, y: fc.constantFrom(0, height + 1), z }),
                fc.record({ x: fc.constantFrom(-halfX - 1, halfX + 1), y, z }),
                fc.record({ x, y, z: fc.constantFrom(-halfZ - 1, halfZ + 1) }),
              ),
              { minLength: 1 },
            ),
          );
        }),
        ([kind, outside]) => {
          const world = new FakeWorld();
          world.campSpace = (_, at) =>
            outside.some(
              (c) =>
                at.x === cmd.blockLocation.x + c.x &&
                at.y === cmd.blockLocation.y + c.y &&
                at.z === cmd.blockLocation.z + c.z,
            );
          expect(
            new PlaceVehicle(world, new InMemoryRepo(), log).execute({
              ...cmd,
              kind,
            }),
          ).toBe(true);
        },
      ),
    );
  });

  it("asks camp with the command's dimension", () => {
    const world = new FakeWorld();
    const dimensions: string[] = [];
    world.campSpace = (dim) => {
      dimensions.push(dim);
      return false;
    };
    new PlaceVehicle(world, new InMemoryRepo(), log).execute(cmd);
    expect(new Set(dimensions)).toEqual(new Set([cmd.dimensionId]));
  });
});

describe("PlaceVehicle spawn failures", () => {
  it("conserves the item or entity at every failure point outside Creative", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          "consume",
          "spawn",
          "initialization",
          "cleanup",
          "success",
        ),
        fc.constantFrom(...VEHICLE_KINDS),
        fc.integer({ min: 0, max: 8 }),
        (failure, kind, slot) => {
          const world = new FakeWorld();
          const repo = new InMemoryRepo();
          world.itemInSlot = failure !== "consume";
          if (failure !== "success" && failure !== "consume")
            world.spawnFailure = {
              status: "failed",
              cleaned: failure !== "cleanup",
            };
          const spawn = vi.spyOn(world, "spawnVehicle");
          const result = new PlaceVehicle(world, repo, log).execute({
            ...cmd,
            kind,
            slot,
          });
          const consumed = world.calls.filter((c) =>
            c.startsWith("consume:"),
          ).length;
          const refunded = world.calls.filter((c) =>
            c.startsWith("refund:"),
          ).length;
          const items = 1 - consumed + refunded;
          const entities =
            world.owners.size +
            (failure === "cleanup" && spawn.mock.calls.length > 0 ? 1 : 0);
          expect(items + entities).toBe(1);
          expect(result).toBe(failure === "success");
          expect(repo.ids()).toHaveLength(result ? 1 : 0);
          expect(refunded).toBe(
            failure === "spawn" || failure === "initialization" ? 1 : 0,
          );
          if (refunded)
            expect(world.calls).toContain(`refund:p:${slot}:${kind}`);
          if (!result) {
            expect(
              world.calls.some(
                (c) => c.startsWith("gift:") || c.startsWith("markGift:"),
              ),
            ).toBe(false);
            expect(world.giftsReceived.size).toBe(0);
          }
        },
      ),
    );
  });

  it("withholds the refund and warns when cleanup is unconfirmed", () => {
    const world = new FakeWorld();
    world.spawnFailure = { status: "failed", cleaned: false };
    const repo = new InMemoryRepo();
    const save = vi.spyOn(repo, "save");
    const logger = { warn: vi.fn() };
    expect(
      new PlaceVehicle(world, repo, logger).execute({ ...cmd, kind: "camper" }),
    ).toBe(false);
    expect(world.calls).toEqual(["consume:p:2:camper"]);
    expect(save).not.toHaveBeenCalled();
    expect(world.giftsReceived.size).toBe(0);
    expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
      "p: camper placement failed; cleanup unconfirmed, item not refunded",
    );
  });

  it("never consumes or refunds a Creative player's item on spawn failure", () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.constantFrom(...VEHICLE_KINDS),
        (cleaned, kind) => {
          const world = new FakeWorld();
          world.creativePlayers.add("p");
          world.spawnFailure = { status: "failed", cleaned };
          const repo = new InMemoryRepo();
          expect(
            new PlaceVehicle(world, repo, log).execute({ ...cmd, kind }),
          ).toBe(false);
          expect(world.calls).toEqual([]);
          expect(repo.ids()).toEqual([]);
        },
      ),
    );
  });
});
