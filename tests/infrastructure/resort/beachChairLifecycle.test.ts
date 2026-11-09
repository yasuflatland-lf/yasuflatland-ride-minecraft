import { beforeEach, expect, it, vi } from "vitest";
import { LieOnBeachChair } from "../../../src/application/resort/lieOnBeachChair";
import { BEACH_CHAIR_SPEC } from "../../../src/domain/resort/spec";
import { BedrockBeachChairWorld } from "../../../src/infrastructure/resort/bedrock/bedrockBeachChairWorld";
import { registerBeachChairLifecycle } from "../../../src/infrastructure/resort/bedrock/handlers/beachChairLifecycle";
import {
  BEACH_CHAIR,
  BEACH_CHAIR_TOP,
} from "../../../src/infrastructure/resort/identifiers";

const game = vi.hoisted(() => {
  const handlers = new Map<string, (ev: unknown) => void>();
  const events = new Proxy(
    {},
    {
      get: (_, name: string) => ({
        subscribe: (fn: (ev: unknown) => void) => handlers.set(name, fn),
      }),
    },
  );
  return {
    handlers,
    events,
    run: vi.fn(),
    interval: vi.fn(),
    getDimension: vi.fn(),
    getEntity: vi.fn(),
  };
});
vi.mock("@minecraft/server", () => ({
  world: {
    beforeEvents: game.events,
    afterEvents: game.events,
    getDimension: game.getDimension,
    getEntity: game.getEntity,
  },
  system: { run: game.run, runInterval: game.interval },
}));
beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  game.handlers.clear();
});
function fixture() {
  const adapter = new BedrockBeachChairWorld({
    isVehicleSpace: () => false,
    isCampSpace: () => false,
  });
  const remember = vi
    .spyOn(adapter, "remember")
    .mockReturnValue({ dimension: {} as never, cells: [] });
  const clear = vi.spyOn(adapter, "clearTop").mockReturnValue(true);
  const sync = vi.spyOn(adapter, "syncTop").mockImplementation(() => {});
  const owner = vi.spyOn(adapter, "topOwner").mockReturnValue("chair");
  const dimension = {
    getBlock: vi.fn(),
    getEntities: vi.fn(() => [{ id: "chair" }]),
  };
  game.getDimension.mockReturnValue(dimension);
  game.getEntity.mockReturnValue(undefined);
  const riders = new LieOnBeachChair(adapter);
  const refresh = vi.spyOn(riders, "refresh").mockImplementation(() => {});
  registerBeachChairLifecycle(adapter, riders);
  return {
    refresh,
    remember,
    clear,
    sync,
    owner,
    dimension,
    entity: {
      id: "chair",
      typeId: BEACH_CHAIR,
      dimension,
      location: { x: 1, y: 64, z: 2 },
    },
  };
}
it("restores loaded chairs in every dimension, remembers loaded records and guards owned blocks", () => {
  const f = fixture();
  game.handlers.get("entityLoad")?.({ entity: f.entity });
  expect(f.remember).toHaveBeenCalledWith(f.entity);
  expect(game.interval).toHaveBeenCalledWith(
    expect.any(Function),
    BEACH_CHAIR_SPEC.topSyncTicks,
  );
  game.interval.mock.calls[0]?.[0]();
  expect(f.sync).toHaveBeenCalledTimes(3);
  const ev = {
    dimension: { id: "overworld" },
    block: { typeId: BEACH_CHAIR_TOP, location: { x: 1, y: 64, z: 2 } },
    cancel: false,
  };
  game.handlers.get("playerBreakBlock")?.(ev);
  expect(ev.cancel).toBe(true);
  expect(f.owner).toHaveBeenCalledWith(
    "overworld",
    ev.block.location,
    BEACH_CHAIR_TOP,
  );
  f.owner.mockReturnValue(undefined);
  ev.cancel = false;
  game.handlers.get("playerBreakBlock")?.(ev);
  expect(ev.cancel).toBe(false);
});
it("distinguishes chunk unloads from removals and retries unavailable cells after confirmed removal", () => {
  const f = fixture();
  const remove = game.handlers.get("entityRemove");
  remove?.({ removedEntity: f.entity });
  f.dimension.getBlock.mockReturnValue(undefined);
  game.run.mock.lastCall?.[0]();
  expect(f.clear).not.toHaveBeenCalled();
  remove?.({ removedEntity: f.entity });
  f.dimension.getBlock.mockImplementation(() => {
    throw Error("unloaded");
  });
  game.run.mock.lastCall?.[0]();
  expect(f.clear).not.toHaveBeenCalled();
  remove?.({ removedEntity: f.entity });
  game.getEntity.mockReturnValue({ ...f.entity, isValid: true });
  game.run.mock.lastCall?.[0]();
  expect(f.clear).not.toHaveBeenCalled();
  game.getEntity.mockReturnValue(undefined);
  f.dimension.getBlock.mockReturnValue({});
  f.clear.mockReturnValueOnce(false);
  remove?.({ removedEntity: f.entity });
  expect(f.clear).not.toHaveBeenCalled();
  game.run.mock.lastCall?.[0]();
  expect(f.clear).toHaveBeenCalledExactlyOnceWith("chair");
  game.interval.mock.calls[0]?.[0]();
  expect(f.clear).toHaveBeenCalledTimes(2);
  game.interval.mock.calls[0]?.[0]();
  expect(f.clear).toHaveBeenCalledTimes(2);
});

it("scans all loaded dimensions at the pose interval after reload", () => {
  const f = fixture();
  expect(game.interval.mock.calls[1]?.[1]).toBe(
    BEACH_CHAIR_SPEC.poseRefreshTicks,
  );
  game.interval.mock.calls[1]?.[0]();
  expect(f.refresh).toHaveBeenCalledExactlyOnceWith([
    "chair",
    "chair",
    "chair",
  ]);
  f.dimension.getEntities.mockReturnValue([]);
  game.interval.mock.calls[1]?.[0]();
  expect(f.refresh).toHaveBeenLastCalledWith([]);
});
