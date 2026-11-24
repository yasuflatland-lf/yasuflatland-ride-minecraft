import { beforeEach, expect, it, vi } from "vitest";
import { subscribeItemOnBlock } from "../../../src/infrastructure/shared/placeable";

const game = vi.hoisted(() => ({ tick: 0, subscribe: vi.fn(), run: vi.fn() }));
vi.mock("@minecraft/server", () => ({
  Direction: { Up: "Up", North: "North" },
  world: {
    beforeEvents: { playerInteractWithBlock: { subscribe: game.subscribe } },
  },
  system: {
    get currentTick() {
      return game.tick;
    },
    run: game.run,
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  game.tick = 0;
});

function event(player = "alice") {
  return {
    player: {
      id: player,
      selectedSlotIndex: 3,
      getRotation: () => ({ y: 45 }),
    },
    isFirstEvent: true,
    itemStack: { typeId: "test:gear" },
    blockFace: "North",
    block: { dimension: { id: "nether" }, location: { x: 1, y: 2, z: 3 } },
    cancel: false,
  };
}

const kindOf = (item: string) => (item === "test:gear" ? 0 : undefined);

it("leaves unhandled presses alone and allows a later accepted press in the same tick", () => {
  const accept = vi.fn(() => false);
  subscribeItemOnBlock({ kindOf, accept, place: vi.fn() });
  const press = game.subscribe.mock.calls[0]?.[0];
  for (const over of [
    { isFirstEvent: false },
    { itemStack: undefined },
    { itemStack: { typeId: "test:unrelated" } },
  ]) {
    const ev = { ...event(), ...over };
    press(ev);
    expect(ev.cancel).toBe(false);
  }
  expect(accept).not.toHaveBeenCalled();
  const ev = event();
  press(ev);
  expect(accept).toHaveBeenCalledExactlyOnceWith(
    "nether",
    { x: 1, y: 2, z: 3 },
    "north",
  );
  expect(ev.cancel).toBe(false);
  expect(game.run).not.toHaveBeenCalled();
  accept.mockReturnValue(true);
  ev.blockFace = "Up";
  press(ev);
  expect(accept).toHaveBeenLastCalledWith("nether", { x: 1, y: 2, z: 3 }, "up");
  expect(ev.cancel).toBe(true);
  expect(game.run).toHaveBeenCalledOnce();
});

it("cancels duplicates and defers one snapshot per player per tick", () => {
  const place = vi.fn();
  subscribeItemOnBlock({ kindOf, place });
  const press = game.subscribe.mock.calls[0]?.[0];
  const ev = event();
  press(ev);
  const duplicate = event();
  press(duplicate);
  expect(duplicate.cancel).toBe(true);
  expect(game.run).toHaveBeenCalledOnce();
  press(event("bob"));
  game.tick++;
  press(event());
  expect(game.run).toHaveBeenCalledTimes(3);
  expect(place).not.toHaveBeenCalled();

  ev.block.location.x = 99;
  ev.player.selectedSlotIndex = 8;
  ev.player.getRotation = () => ({ y: 90 });
  game.run.mock.calls[0]?.[0]();
  expect(place).toHaveBeenCalledExactlyOnceWith({
    kind: 0,
    player: "alice",
    dimension: "nether",
    block: { x: 1, y: 2, z: 3 },
    face: "north",
    yaw: 45,
    slot: 3,
  });
});
