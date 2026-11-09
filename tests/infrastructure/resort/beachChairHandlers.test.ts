import { beforeEach, expect, it, vi } from "vitest";
import { PlaceBeachChair } from "../../../src/application/resort/placeBeachChair";
import { TakeBackBeachChair } from "../../../src/application/resort/takeBackBeachChair";
import { registerBeachChairHits } from "../../../src/infrastructure/resort/bedrock/handlers/beachChairHits";
import { registerBeachChairPlacement } from "../../../src/infrastructure/resort/bedrock/handlers/beachChairPlacement";
import {
  BEACH_CHAIR,
  BEACH_CHAIR_ITEM,
} from "../../../src/infrastructure/resort/identifiers";
import { fakeBeachChairWorld } from "../../application/resort/fakeBeachChairWorld";

vi.mock("../../../src/infrastructure/shared/dyes", () => ({
  heldDye: () => (game.dye ? "red" : undefined),
}));
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
  class Player {
    id = "p";
    selectedSlotIndex = 2;
    getRotation() {
      return { y: 90 };
    }
  }
  return {
    handlers,
    Player,
    events,
    run: vi.fn(),
    runInterval: vi.fn(),
    getDimension: vi.fn(),
    getEntity: vi.fn(),
    tick: 0,
    dye: false,
  };
});
vi.mock("@minecraft/server", () => ({
  Direction: { Up: "Up" },
  Player: game.Player,
  world: {
    beforeEvents: game.events,
    afterEvents: game.events,
    getDimension: game.getDimension,
    getEntity: game.getEntity,
  },
  system: {
    get currentTick() {
      return game.tick;
    },
    run: game.run,
    runInterval: game.runInterval,
    afterEvents: game.events,
  },
}));
beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  game.handlers.clear();
  game.tick = 10;
  game.dye = false;
});
function setup() {
  const world = fakeBeachChairWorld();
  registerBeachChairPlacement(new PlaceBeachChair(world));
  registerBeachChairHits(new TakeBackBeachChair(world));
}
it("defers placement, captures the command, cancels duplicates and ignores unrelated presses", () => {
  const execute = vi
    .spyOn(PlaceBeachChair.prototype, "execute")
    .mockReturnValue(true);
  setup();
  const press = game.handlers.get("playerInteractWithBlock");
  const ev = {
    isFirstEvent: true,
    itemStack: { typeId: BEACH_CHAIR_ITEM },
    player: new game.Player(),
    block: { dimension: { id: "overworld" }, location: { x: 1, y: 2, z: 3 } },
    blockFace: "Up",
    cancel: false,
  };
  press?.({ ...ev, isFirstEvent: false });
  press?.({ ...ev, itemStack: { typeId: "other" } });
  expect(game.run).not.toHaveBeenCalled();
  press?.(ev);
  press?.(ev);
  expect(ev.cancel).toBe(true);
  expect(execute).not.toHaveBeenCalled();
  expect(game.run).toHaveBeenCalledTimes(1);
  ev.block.location.x = 99;
  game.run.mock.calls[0]?.[0]();
  expect(execute).toHaveBeenCalledWith({
    player: "p",
    dimension: "overworld",
    block: { x: 1, y: 2, z: 3 },
    face: "up",
    yaw: 90,
    slot: 2,
  });
  game.tick++;
  press?.(ev);
  expect(game.run).toHaveBeenCalledTimes(2);
});
it("counts hits only on chairs once per player per tick", () => {
  const execute = vi
    .spyOn(TakeBackBeachChair.prototype, "execute")
    .mockImplementation(() => {});
  setup();
  const hit = game.handlers.get("entityHitEntity");
  const ev = {
    damagingEntity: new game.Player(),
    hitEntity: { id: "chair", typeId: BEACH_CHAIR },
  };
  hit?.({ ...ev, hitEntity: { typeId: "other" } });
  hit?.({ ...ev, damagingEntity: { id: "mob" } });
  hit?.(ev);
  hit?.(ev);
  expect(execute).not.toHaveBeenCalled();
  expect(game.run).toHaveBeenCalledTimes(1);
  game.run.mock.calls[0]?.[0]();
  expect(execute).toHaveBeenCalledExactlyOnceWith({
    id: "chair",
    player: "p",
    tick: 10,
  });
  game.tick++;
  hit?.(ev);
  expect(game.run).toHaveBeenCalledTimes(2);
  game.run.mock.calls[1]?.[0]();
  expect(execute).toHaveBeenCalledTimes(2);
});
it("ignores dye hits without scheduling recovery", () => {
  setup();
  game.dye = true;
  game.handlers.get("entityHitEntity")?.({
    damagingEntity: new game.Player(),
    hitEntity: { id: "chair", typeId: BEACH_CHAIR },
  });
  expect(game.run).not.toHaveBeenCalled();
});
