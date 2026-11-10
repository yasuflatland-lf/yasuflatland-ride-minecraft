import { beforeEach, expect, it, vi } from "vitest";
import { registerFurnitureTopInteraction } from "../../../src/infrastructure/resort/bedrock/handlers/furnitureTopInteraction";

const game = vi.hoisted(() => ({
  interact: vi.fn(),
  run: vi.fn(),
}));
vi.mock("@minecraft/server", () => ({
  BlockTypes: {
    get: (id: string) => (id === "minecraft:stone" ? {} : undefined),
  },
  Direction: {
    Up: "Up",
    Down: "Down",
    North: "North",
    South: "South",
    East: "East",
    West: "West",
  },
  system: {
    run: game.run,
  },
  world: {
    beforeEvents: { playerInteractWithBlock: { subscribe: game.interact } },
  },
}));
beforeEach(() => vi.clearAllMocks());
function fixture() {
  const table = { id: "table" };
  const adapter = {
    ownerAt: vi.fn(() => "table"),
    entity: vi.fn(() => table),
    hostedAbove: vi.fn(() => true),
  };
  const place = vi.fn(() => false);
  registerFurnitureTopInteraction(adapter as never, place);
  return {
    adapter,
    table,
    place,
    interact: game.interact.mock.calls[0]?.[0],
  };
}
function tabletopEvent(itemId?: string) {
  return {
    player: {},
    isFirstEvent: true,
    blockFace: "Up",
    block: {
      typeId: "yasu_ride:dining_table_top",
      dimension: { id: "overworld" },
      location: { x: 1, y: 2, z: 3 },
    },
    itemStack: itemId ? { typeId: itemId } : undefined,
    cancel: false,
  };
}
it.each(["yasu_ride:gas_lantern_item", "yasu_ride:dutch_oven_item"])(
  "forwards first tabletop taps with %s and cancels handled interactions",
  (itemId) => {
    const f = fixture();
    f.place.mockReturnValue(true);
    const event = tabletopEvent(itemId);
    f.interact(event);
    expect(f.place).toHaveBeenCalledExactlyOnceWith(event.player, f.table);
    expect(f.adapter.ownerAt).toHaveBeenCalledExactlyOnceWith(
      "overworld",
      event.block.location,
    );
    expect(event.cancel).toBe(true);
    expect(f.adapter.hostedAbove).not.toHaveBeenCalled();
  },
);
it.each([undefined, "minecraft:stick", "minecraft:stone"])(
  "leaves unhandled %s taps uncancelled",
  (itemId) => {
    const f = fixture();
    f.adapter.hostedAbove.mockReturnValue(false);
    const event = tabletopEvent(itemId);
    f.interact(event);
    expect(f.place).toHaveBeenCalledExactlyOnceWith(event.player, f.table);
    expect(event.cancel).toBe(false);
  },
);
it("falls through to the overlap guard for unhandled tabletop block placement", () => {
  const f = fixture();
  const event = tabletopEvent("minecraft:stone");
  f.interact(event);
  expect(f.place).toHaveBeenCalledOnce();
  expect(f.adapter.hostedAbove).toHaveBeenCalledWith("overworld", {
    x: 1,
    y: 3,
    z: 3,
  });
  expect(event.cancel).toBe(true);
});
it("ignores non-first taps and other block types for forwarding", () => {
  const f = fixture();
  const repeated = { ...tabletopEvent(), isFirstEvent: false };
  const other = tabletopEvent();
  other.block.typeId = "minecraft:stone";
  f.interact(repeated);
  f.interact(other);
  expect(f.adapter.ownerAt).not.toHaveBeenCalled();
  expect(f.place).not.toHaveBeenCalled();
  expect(repeated.cancel).toBe(false);
  expect(other.cancel).toBe(false);
});
it("ignores orphan blocks and missing table entities", () => {
  const f = fixture();
  const event = tabletopEvent();
  f.adapter.ownerAt.mockReturnValueOnce(undefined as never);
  f.interact(event);
  expect(f.adapter.entity).not.toHaveBeenCalled();
  f.adapter.entity.mockReturnValue(undefined as never);
  f.interact(event);
  expect(f.place).not.toHaveBeenCalled();
  expect(event.cancel).toBe(false);
});
it.each([
  ["Up", { x: 1, y: 3, z: 3 }],
  ["Down", { x: 1, y: 1, z: 3 }],
  ["East", { x: 2, y: 2, z: 3 }],
  ["West", { x: 0, y: 2, z: 3 }],
  ["North", { x: 1, y: 2, z: 2 }],
  ["South", { x: 1, y: 2, z: 4 }],
])(
  "guards the %s destination and defers the hint",
  (blockFace, destination) => {
    const f = fixture();
    const player = {
      isValid: true,
      onScreenDisplay: { setActionBar: vi.fn() },
    };
    const event = {
      player,
      blockFace,
      block: { location: { x: 1, y: 2, z: 3 }, dimension: { id: "overworld" } },
      itemStack: { typeId: "minecraft:stone" },
      cancel: false,
    };
    f.interact(event);
    expect(event.cancel).toBe(true);
    expect(f.adapter.hostedAbove).toHaveBeenCalledWith(
      "overworld",
      destination,
    );
    expect(player.onScreenDisplay.setActionBar).not.toHaveBeenCalled();
    game.run.mock.calls[0]?.[0]();
    expect(player.onScreenDisplay.setActionBar).toHaveBeenCalledWith({
      translate: "yasu_ride.dining_table.top_occupied",
    });
    f.adapter.hostedAbove.mockReturnValue(false);
    event.cancel = false;
    f.interact(event);
    expect(event.cancel).toBe(false);
    f.adapter.hostedAbove.mockReturnValue(true);
    event.itemStack.typeId = "yasu_ride:gas_lantern_item";
    f.interact(event);
    expect(event.cancel).toBe(false);
    f.interact({ ...event, itemStack: undefined });
  },
);
