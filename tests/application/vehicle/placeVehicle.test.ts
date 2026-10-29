import fc from "fast-check";
import { describe, expect, it } from "vitest";
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
          const placement = new PlaceVehicle(world, new InMemoryRepo());
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
    expect(new PlaceVehicle(world, repo).execute(cmd)).toBe(true);
    expect(world.calls).toEqual([
      "consume:p:2:suv",
      "spawn:minecraft:overworld:10.5,65,-2.5:45:suv",
    ]);
    expect(repo.get(asVehicleId("v1"))?.kind).toBe(cmd.kind);
    expect(repo.get(asVehicleId("v1"))?.yaw).toBeCloseTo(45);
  });

  it("does not consume the item in creative mode", () => {
    const world = new FakeWorld();
    world.creativePlayers.add("p");
    new PlaceVehicle(world, new InMemoryRepo()).execute(cmd);
    expect(world.calls.some((c) => c.startsWith("consume"))).toBe(false);
  });

  it("does not place the vehicle or consume the item when there is no room, such as under a low ceiling", () => {
    const world = new FakeWorld();
    world.air = (at) => !(at.y === 66 && at.x === 10 && at.z === -3);
    expect(new PlaceVehicle(world, new InMemoryRepo()).execute(cmd)).toBe(
      false,
    );
    expect(world.calls).toEqual([]);
    expect(world.owners.size).toBe(0);
  });

  it("does not place a vehicle when the slot no longer holds the item, such as after switching slots or dropping it (ADR 0024)", () => {
    const world = new FakeWorld();
    world.itemInSlot = false;
    const repo = new InMemoryRepo();
    expect(new PlaceVehicle(world, repo).execute(cmd)).toBe(false);
    expect(world.calls).toEqual([]);
    expect(repo.get(asVehicleId("v1"))).toBeUndefined();
    expect(world.owners.size).toBe(0);
  });

  it("places a vehicle in creative mode without needing the item in the slot", () => {
    const world = new FakeWorld();
    world.creativePlayers.add("p");
    world.itemInSlot = false;
    expect(new PlaceVehicle(world, new InMemoryRepo()).execute(cmd)).toBe(true);
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
          const placement = new PlaceVehicle(world, new InMemoryRepo());
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
      new PlaceVehicle(world, new InMemoryRepo()).execute({
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
    const placement = new PlaceVehicle(world, new InMemoryRepo());
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
      new PlaceVehicle(world, new InMemoryRepo()).execute({
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
      new PlaceVehicle(world, new InMemoryRepo()).execute({
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

  it("gives the camping gear box with the camper and the equipment box with the sports boat", () => {
    expect(profileOf("camper").placementGift).toBe("camping_gear_box");
    expect(profileOf("suv").placementGift).toBeUndefined();
    expect(profileOf("sportsboat").placementGift).toBe(
      "sportsboat_equipment_box",
    );
  });
});

const FACES: BlockFace[] = ["up", "down", "north", "south", "east", "west"];
const cellArb = fc.record({
  x: fc.integer({ min: -64, max: 64 }),
  y: fc.integer({ min: -60, max: 300 }),
  z: fc.integer({ min: -64, max: 64 }),
});

describe("PlaceVehicle placement cell (ADR 0050, ADR 0051)", () => {
  it("picks the same cell as the kind's placement rule with the world's water, querying only the given dimension", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...VEHICLE_KINDS),
        cellArb,
        fc.constantFrom(...FACES),
        fc.integer({ min: 0, max: 20 }),
        fc.string({ minLength: 1 }).map(asDimensionId),
        (kind, clicked, face, depth, dimensionId) => {
          const world = new FakeWorld();
          const placement = new PlaceVehicle(world, new InMemoryRepo());
          world.water = (at) =>
            at.x === clicked.x &&
            at.z === clicked.z &&
            at.y > clicked.y &&
            at.y <= clicked.y + depth;
          const cell = placement.cellFor(kind, dimensionId, clicked, face);
          expect(cell).toEqual(
            placementCell(
              profileOf(kind).placement,
              clicked,
              face,
              world.water,
            ),
          );
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

  it("places a land-only kind on the clicked block from the top face only, whatever the water", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("suv", "camper"),
        cellArb,
        fc.constantFrom(...FACES),
        fc.boolean(),
        (kind, clicked, face, wet) => {
          const world = new FakeWorld();
          const placement = new PlaceVehicle(world, new InMemoryRepo());
          world.water = () => wet;
          expect(
            placement.cellFor(kind, asDimensionId("overworld"), clicked, face),
          ).toEqual(face === "up" ? clicked : undefined);
        },
      ),
    );
  });

  it("places the sports boat on the top water cell above the clicked bed, or on the bed when it is dry", () => {
    fc.assert(
      fc.property(
        cellArb,
        fc.integer({ min: 0, max: 16 }),
        (clicked, depth) => {
          const world = new FakeWorld();
          const placement = new PlaceVehicle(world, new InMemoryRepo());
          world.water = (at) =>
            at.x === clicked.x &&
            at.z === clicked.z &&
            at.y > clicked.y &&
            at.y <= clicked.y + depth;
          expect(
            placement.cellFor(
              "sportsboat",
              asDimensionId("overworld"),
              clicked,
              "up",
            ),
          ).toEqual({ x: clicked.x, y: clicked.y + depth, z: clicked.z });
        },
      ),
    );
  });

  it("places the sports boat on the water beside a shore whose side is clicked", () => {
    const world = new FakeWorld();
    const placement = new PlaceVehicle(world, new InMemoryRepo());
    const clicked = { x: 2, y: 5, z: 3 };
    world.water = (at) => at.x === 3 && at.y >= 4 && at.y <= 6;
    expect(
      placement.cellFor(
        "sportsboat",
        asDimensionId("overworld"),
        clicked,
        "east",
      ),
    ).toEqual({ x: 3, y: 6, z: 3 });
    expect(
      placement.cellFor(
        "sportsboat",
        asDimensionId("overworld"),
        clicked,
        "west",
      ),
    ).toBeUndefined();
  });

  it("places on water or lava only the sports boat", () => {
    const world = new FakeWorld();
    const placement = new PlaceVehicle(world, new InMemoryRepo());
    expect(placement.placesOnLiquid("suv")).toBe(false);
    expect(placement.placesOnLiquid("sportsboat")).toBe(true);
    expect(placement.placesOnLiquid("camper")).toBe(false);
    fc.assert(
      fc.property(fc.constantFrom(...VEHICLE_KINDS), (kind) => {
        const world = new FakeWorld();
        const placement = new PlaceVehicle(world, new InMemoryRepo());
        expect(placement.placesOnLiquid(kind)).toBe(
          profileOf(kind).placement.surfaces.includes("water") ||
            profileOf(kind).placement.surfaces.includes("lava"),
        );
      }),
    );
  });

  it("places the sports boat on the top lava cell without allowing other kinds there", () => {
    const world = new FakeWorld();
    const placement = new PlaceVehicle(world, new InMemoryRepo());
    world.lava = (at) => at.x === 3 && at.z === 4 && at.y >= 5 && at.y <= 7;
    expect(
      placement.cellFor(
        "sportsboat",
        asDimensionId("nether"),
        { x: 3, y: 4, z: 4 },
        "up",
      ),
    ).toEqual({ x: 3, y: 7, z: 4 });
    expect(
      placement.cellFor(
        "suv",
        asDimensionId("nether"),
        { x: 3, y: 6, z: 4 },
        "east",
      ),
    ).toBeUndefined();
  });
});

it("consumes the item unless the placing player is in creative mode", () => {
  fc.assert(
    fc.property(
      fc.constantFrom(...VEHICLE_KINDS),
      fc.boolean(),
      (kind, creative) => {
        const world = new FakeWorld();
        if (creative) world.creativePlayers.add("p");
        expect(
          new PlaceVehicle(world, new InMemoryRepo()).execute({ ...cmd, kind }),
        ).toBe(true);
        expect(world.calls.some((c) => c.startsWith("consume"))).toBe(
          !creative,
        );
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
        expect(new PlaceVehicle(world, repo).execute({ ...cmd, kind })).toBe(
          false,
        );
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
            new PlaceVehicle(world, new InMemoryRepo()).execute({
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
    new PlaceVehicle(world, new InMemoryRepo()).execute(cmd);
    expect(new Set(dimensions)).toEqual(new Set([cmd.dimensionId]));
  });
});
