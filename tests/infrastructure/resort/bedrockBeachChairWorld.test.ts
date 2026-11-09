import fc from "fast-check";
import { beforeEach, expect, it, vi } from "vitest";
import {
  beachChairOrigin,
  beachChairPose,
} from "../../../src/domain/resort/beachChair";
import { asBeachChairId } from "../../../src/domain/resort/ids";
import { asDimensionId } from "../../../src/domain/shared/ids";
import { BedrockBeachChairWorld } from "../../../src/infrastructure/resort/bedrock/bedrockBeachChairWorld";
import {
  BEACH_CHAIR,
  BEACH_CHAIR_FOLD_EVENT,
  BEACH_CHAIR_FOLDED,
  BEACH_CHAIR_UNFOLD_EVENT,
} from "../../../src/infrastructure/resort/identifiers";
import { TopHostRegistry } from "../../../src/infrastructure/shared/tableTop/registry";

const game = vi.hoisted(() => ({ getEntity: vi.fn(), getDimension: vi.fn() }));
vi.mock("@minecraft/server", () => ({
  world: game,
  Direction: { Up: "Up" },
  BlockPermutation: { resolve: (typeId: string) => ({ typeId }) },
  GameMode: { Creative: "Creative" },
  ItemStack: class {
    constructor(
      public typeId: string,
      public amount: number,
    ) {}
  },
}));
beforeEach(() => vi.clearAllMocks());
const id = asBeachChairId("chair");
const dimensionId = asDimensionId("overworld");
function fixture(yaw = 0) {
  const pose = beachChairPose({ x: 10, y: 63, z: 20 }, yaw);
  let folded = true;
  const dimension = {
    id: dimensionId,
    getBlock: vi.fn(),
    getEntities: vi.fn<
      () => { location: { x: number; y: number; z: number } }[]
    >(() => []),
    getBlockFromRay: vi.fn(),
    spawnEntity: vi.fn(),
    spawnItem: vi.fn(),
  };
  let riders: unknown[] = [];
  const entity = {
    id,
    typeId: BEACH_CHAIR,
    isValid: true,
    dimension,
    location: beachChairOrigin(pose),
    getProperty: () => folded,
    setProperty: vi.fn((_name: string, value: boolean) => {
      folded = value;
    }),
    getComponent: () => ({ getRiders: () => riders }),
    getRotation: () => ({ y: pose.yaw }),
    clearVelocity: vi.fn(),
    teleport: vi.fn(),
    remove: vi.fn(),
    triggerEvent: vi.fn(),
    setRotation: vi.fn(),
  };
  game.getDimension.mockReturnValue(dimension);
  game.getEntity.mockImplementation((query: string) =>
    query === id ? entity : undefined,
  );
  const topHosts = new TopHostRegistry();
  const deps = {
    topHosts,
    isVehicleSpace: vi.fn(() => false),
    isCampSpace: vi.fn(() => false),
  };
  return {
    pose,
    dimension,
    setRiders: (value: unknown[]) => {
      riders = value;
    },
    entity,
    deps,
    adapter: new BedrockBeachChairWorld(deps),
  };
}
it.each([true, false])(
  "reports form and rider occupancy when folded is %s",
  (folded) => {
    const f = fixture();
    f.entity.setProperty(BEACH_CHAIR_FOLDED, folded);
    for (const riders of [[], [{}]]) {
      f.setRiders(riders);
      expect(f.adapter.state(id)).toEqual({
        form: folded ? "table" : "chair",
        occupied: riders.length > 0,
        somethingOnTop: false,
      });
    }
  },
);
it("folds and holds the middle-cell centre at floor height despite drift at every quarter turn", () => {
  fc.assert(
    fc.property(
      fc.record({
        x: fc.double({ min: -0.5, max: 0.5 - 1e-10, noNaN: true }),
        y: fc.double({ min: -0.1, max: 0.1, noNaN: true }),
        z: fc.double({ min: -0.5, max: 0.5 - 1e-10, noNaN: true }),
      }),
      (drift) => {
        for (const yaw of [0, 90, 180, 270]) {
          const f = fixture(yaw);
          const origin = beachChairOrigin(f.pose);
          f.entity.location = {
            x: origin.x + drift.x,
            y: origin.y + drift.y,
            z: origin.z + drift.z,
          };
          f.adapter.setForm(id, "table");
          expect(f.entity.setProperty).toHaveBeenCalledWith(
            BEACH_CHAIR_FOLDED,
            true,
          );
          expect(f.entity.triggerEvent).toHaveBeenCalledExactlyOnceWith(
            BEACH_CHAIR_FOLD_EVENT,
          );
          expect(f.entity.clearVelocity).toHaveBeenCalledOnce();
          expect(f.entity.teleport).toHaveBeenCalledExactlyOnceWith(
            beachChairOrigin(f.pose),
          );
          expect(
            f.entity.triggerEvent.mock.invocationCallOrder[0],
          ).toBeLessThan(
            f.entity.clearVelocity.mock.invocationCallOrder[0] ?? 0,
          );
          expect(
            f.entity.clearVelocity.mock.invocationCallOrder[0],
          ).toBeLessThan(f.entity.teleport.mock.invocationCallOrder[0] ?? 0);
        }
      },
    ),
  );
});
it("unfolds without holding the entity", () => {
  const f = fixture();
  f.adapter.setForm(id, "chair");
  expect(f.entity.setProperty).toHaveBeenCalledWith(BEACH_CHAIR_FOLDED, false);
  expect(f.entity.triggerEvent).toHaveBeenCalledExactlyOnceWith(
    BEACH_CHAIR_UNFOLD_EVENT,
  );
  expect(f.entity.clearVelocity).not.toHaveBeenCalled();
  expect(f.entity.teleport).not.toHaveBeenCalled();
});
it("removes the chair entity", () => {
  const f = fixture();
  f.adapter.remove(id);
  expect(f.entity.remove).toHaveBeenCalledOnce();
});
it("tolerates an entity unloading while holding its pose", () => {
  const f = fixture();
  f.entity.clearVelocity.mockImplementation(() => {
    throw Error("unloaded");
  });
  expect(() => f.adapter.setForm(id, "table")).not.toThrow();
});

it.each([false, true])(
  "reports hosted occupancy when items are present: %s",
  (occupied) => {
    const f = fixture();
    const item = { at: { x: 0, z: 0 }, footprint: { halfX: 2, halfZ: 3 } };
    const items = vi
      .spyOn(f.deps.topHosts, "itemsOnTop")
      .mockReturnValue(occupied ? [item] : []);
    expect(f.adapter.state(id)?.somethingOnTop).toBe(occupied);
    expect(items).toHaveBeenCalledExactlyOnceWith("beach_chair", id);
  },
);
