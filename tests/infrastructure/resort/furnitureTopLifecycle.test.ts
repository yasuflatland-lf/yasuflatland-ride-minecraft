import { beforeEach, expect, it, vi } from "vitest";
import { FURNITURE_TOP_SYNC_TICKS } from "../../../src/domain/resort/furniture";
import { asFurnitureId } from "../../../src/domain/resort/ids";
import type { BedrockFurnitureWorld } from "../../../src/infrastructure/resort/bedrock/bedrockFurnitureWorld";
import { registerFurnitureTopLifecycle } from "../../../src/infrastructure/resort/bedrock/handlers/furnitureTopLifecycle";
import {
  DINING_TABLE_TOP,
  FURNITURE_IDS,
} from "../../../src/infrastructure/resort/identifiers";

const game = vi.hoisted(() => {
  const handlers = new Map<string, (ev: unknown) => void>();
  const events = new Proxy(
    {},
    {
      get: (_target, name: string) => ({
        subscribe: (fn: (ev: unknown) => void) => handlers.set(name, fn),
      }),
    },
  );
  return {
    handlers,
    events,
    run: vi.fn(),
    runInterval: vi.fn(),
    getDimension: vi.fn(),
  };
});
vi.mock("@minecraft/server", () => ({
  world: {
    beforeEvents: game.events,
    afterEvents: game.events,
    getDimension: game.getDimension,
  },
  system: { run: game.run, runInterval: game.runInterval },
}));
beforeEach(() => {
  vi.resetAllMocks();
  game.handlers.clear();
});
function fixture() {
  const adapter = {
    remember: vi.fn(),
    entity: vi.fn(),
    layTop: vi.fn(),
    clearTop: vi.fn(() => true),
    ownerAt: vi.fn(),
  };
  const dimension = {
    getBlock: vi.fn(() => ({ typeId: "minecraft:air" }) as object | undefined),
    getEntities: vi.fn(() => [entity]),
  };
  const entity = {
    id: "table",
    typeId: FURNITURE_IDS.dining_table.entity,
    dimension,
    location: { x: 0, y: 64, z: 0 },
  };
  game.getDimension.mockReturnValue(dimension);
  registerFurnitureTopLifecycle(adapter as unknown as BedrockFurnitureWorld);
  const scan = () => game.runInterval.mock.calls[0]?.[0]();
  const remove = () => {
    game.handlers.get("entityRemove")?.({ removedEntity: entity });
    game.run.mock.calls.at(-1)?.[0]();
  };
  return { adapter, dimension, entity, scan, remove };
}
it("remembers only top-bearing furniture and restores it on the configured interval", () => {
  const f = fixture();
  game.handlers.get("entityLoad")?.({
    entity: { ...f.entity, typeId: FURNITURE_IDS.dining_chair.entity },
  });
  expect(f.adapter.remember).not.toHaveBeenCalled();
  game.handlers.get("entityLoad")?.({ entity: f.entity });
  expect(f.adapter.remember).toHaveBeenCalledWith(f.entity);
  expect(game.runInterval).toHaveBeenCalledWith(
    expect.any(Function),
    FURNITURE_TOP_SYNC_TICKS,
  );
  f.scan();
  expect(f.adapter.layTop).toHaveBeenCalledWith(asFurnitureId("table"));
  expect(game.getDimension.mock.calls).toEqual([
    ["overworld"],
    ["nether"],
    ["the_end"],
  ]);
  expect(f.dimension.getEntities).toHaveBeenCalledWith({
    type: FURNITURE_IDS.dining_table.entity,
  });
});
it("defers cleanup and retries both unavailable origins and incomplete clears", () => {
  const f = fixture();
  f.dimension.getBlock.mockReturnValue(undefined);
  game.handlers.get("entityRemove")?.({ removedEntity: f.entity });
  expect(f.adapter.clearTop).not.toHaveBeenCalled();
  game.run.mock.calls[0]?.[0]();
  expect(f.adapter.clearTop).not.toHaveBeenCalled();
  f.dimension.getBlock.mockReturnValue({});
  f.adapter.clearTop.mockReturnValue(false);
  f.scan();
  expect(f.adapter.clearTop).toHaveBeenCalledTimes(1);
  f.adapter.clearTop.mockReturnValue(true);
  f.scan();
  f.scan();
  expect(f.adapter.clearTop).toHaveBeenCalledTimes(2);
});
it("preserves a table that loads again before deferred removal cleanup", () => {
  const f = fixture();
  f.adapter.entity.mockReturnValue(f.entity);
  f.remove();
  f.scan();
  expect(f.adapter.clearTop).not.toHaveBeenCalled();
});
it("cancels owned tabletop breaks through the laid-block guard", () => {
  const f = fixture();
  const event = {
    block: { typeId: DINING_TABLE_TOP, location: f.entity.location },
    dimension: { id: "overworld" },
    cancel: false,
  };
  const breaking = game.handlers.get("playerBreakBlock");
  breaking?.(event);
  expect(event.cancel).toBe(false);
  f.adapter.ownerAt.mockReturnValue(asFurnitureId("table"));
  breaking?.(event);
  expect(event.cancel).toBe(true);
  event.cancel = false;
  event.block.typeId = "minecraft:stone";
  breaking?.(event);
  expect(event.cancel).toBe(false);
});
