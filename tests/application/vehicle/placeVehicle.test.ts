import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  PlaceVehicle,
  type PlaceVehicleCommand,
} from "../../../src/application/vehicle/placeVehicle";
import { VEHICLE_KINDS } from "../../../src/domain/vehicle/kind";
import { profileOf } from "../../../src/domain/vehicle/kinds/index";
import {
  type BlockFace,
  placementCell,
} from "../../../src/domain/vehicle/placement";
import { FakeWorld, InMemoryRepo } from "./fakes";

const cmd: PlaceVehicleCommand = {
  kind: "suv",
  playerId: "p",
  dimensionId: "minecraft:overworld",
  blockLocation: { x: 10, y: 64, z: -3 },
  yaw: 45,
  slot: 2,
};

describe("PlaceVehicle (ADR 0008)", () => {
  it("records the placing player as the owner of each vehicle (ADR 0066)", () => {
    fc.assert(
      fc.property(
        fc.array(fc.string(), { minLength: 1 }),
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
    expect(repo.get("v1")?.kind).toBe(cmd.kind);
    expect(repo.get("v1")?.yaw).toBeCloseTo(45);
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
    expect(repo.get("v1")).toBeUndefined();
    expect(world.owners.size).toBe(0);
  });

  it("places a vehicle in creative mode without needing the item in the slot", () => {
    const world = new FakeWorld();
    world.creativePlayers.add("p");
    world.itemInSlot = false;
    expect(new PlaceVehicle(world, new InMemoryRepo()).execute(cmd)).toBe(true);
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
        fc.string({ minLength: 1 }),
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
          expect(placement.cellFor(kind, "overworld", clicked, face)).toEqual(
            face === "up" ? clicked : undefined,
          );
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
            placement.cellFor("sportsboat", "overworld", clicked, "up"),
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
      placement.cellFor("sportsboat", "overworld", clicked, "east"),
    ).toEqual({ x: 3, y: 6, z: 3 });
    expect(
      placement.cellFor("sportsboat", "overworld", clicked, "west"),
    ).toBeUndefined();
  });

  it("places on water only the sports boat", () => {
    const world = new FakeWorld();
    const placement = new PlaceVehicle(world, new InMemoryRepo());
    expect(placement.placesOnWater("suv")).toBe(false);
    expect(placement.placesOnWater("sportsboat")).toBe(true);
    expect(placement.placesOnWater("camper")).toBe(false);
    fc.assert(
      fc.property(fc.constantFrom(...VEHICLE_KINDS), (kind) => {
        const world = new FakeWorld();
        const placement = new PlaceVehicle(world, new InMemoryRepo());
        expect(placement.placesOnWater(kind)).toBe(
          profileOf(kind).placement.surfaces.includes("water"),
        );
      }),
    );
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
