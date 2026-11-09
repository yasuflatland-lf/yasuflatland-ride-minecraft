import { beforeEach, expect, it, vi } from "vitest";
import { registerFurnitureTopInteraction } from "../../../src/infrastructure/resort/bedrock/handlers/furnitureTopInteraction";

const game = vi.hoisted(() => ({
  startup: vi.fn(),
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
    beforeEvents: { startup: { subscribe: game.startup } },
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
  const registerCustomComponent = vi.fn();
  game.startup.mock.calls[0]?.[0]({
    blockComponentRegistry: { registerCustomComponent },
  });
  return {
    adapter,
    table,
    place,
    tap: registerCustomComponent.mock.calls[0]?.[1].onPlayerInteract,
    interact: game.interact.mock.calls[0]?.[0],
  };
}
it("forwards owned block taps and leaves missing players and orphan blocks alone", () => {
  const f = fixture();
  const event = {
    player: {},
    dimension: { id: "overworld" },
    block: { location: { x: 1, y: 2, z: 3 } },
  };
  f.tap(event);
  expect(f.place).toHaveBeenCalledExactlyOnceWith(event.player, f.table);
  expect(f.adapter.ownerAt).toHaveBeenCalledWith(
    "overworld",
    event.block.location,
  );
  f.adapter.entity.mockReturnValue(undefined as never);
  f.tap(event);
  f.tap({ ...event, player: undefined });
  expect(f.place).toHaveBeenCalledOnce();
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
