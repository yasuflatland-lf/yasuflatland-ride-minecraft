import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type FurnitureKind,
  furniturePose,
} from "../../../src/domain/resort/furniture";
import { asFurnitureId } from "../../../src/domain/resort/ids";
import { asDimensionId, asPlayerId } from "../../../src/domain/shared/ids";
import { BedrockFurnitureWorld } from "../../../src/infrastructure/resort/bedrock/bedrockFurnitureWorld";
import { FURNITURE_IDS } from "../../../src/infrastructure/resort/identifiers";

const game = vi.hoisted(() => ({
  getEntity: vi.fn(),
  getDimension: vi.fn(),
  playerById: vi.fn(),
  giveOrDrop: vi.fn(),
  consumeHeld: vi.fn(),
}));
vi.mock("@minecraft/server", () => ({
  world: game,
  Direction: { Up: "Up" },
  ItemStack: class {
    constructor(
      public typeId: string,
      public amount: number,
    ) {}
  },
}));
vi.mock("../../../src/infrastructure/shared/players", () => ({
  playerById: game.playerById,
  giveOrDrop: game.giveOrDrop,
  consumeHeld: game.consumeHeld,
  isCreative: () => false,
}));
beforeEach(() => vi.resetAllMocks());
describe.each(Object.keys(FURNITURE_IDS) as FurnitureKind[])("%s", (kind) => {
  function fixture() {
    const dimension = { spawnEntity: vi.fn(), spawnItem: vi.fn() };
    const entity = {
      id: "furniture",
      typeId: FURNITURE_IDS[kind].entity,
      isValid: true,
      dimension,
      location: { x: 0, y: 64, z: 0 },
      setRotation: vi.fn(),
      remove: vi.fn(),
      getComponent: vi.fn(),
    };
    game.getEntity.mockReturnValue(entity);
    game.getDimension.mockReturnValue(dimension);
    dimension.spawnEntity.mockReturnValue(entity);
    const adapter = new BedrockFurnitureWorld({
      isVehicleSpace: () => false,
      isCampSpace: () => false,
    });
    return { dimension, entity, adapter };
  }
  const id = asFurnitureId("furniture");
  const player = asPlayerId("player");
  it("spawns the selected kind at its footprint centre and rolls back a failed rotation", () => {
    const f = fixture();
    const pose = furniturePose({ x: 0, y: 63, z: 0 }, 90, kind);
    expect(f.adapter.spawn(asDimensionId("overworld"), pose)).toBe(id);
    expect(f.dimension.spawnEntity).toHaveBeenCalledExactlyOnceWith(
      FURNITURE_IDS[kind].entity,
      pose.origin,
    );
    expect(f.entity.setRotation).toHaveBeenCalledWith({ x: 0, y: pose.yaw });
    f.entity.setRotation.mockImplementation(() => {
      throw Error("unloaded");
    });
    expect(f.adapter.spawn(asDimensionId("overworld"), pose)).toBeUndefined();
    expect(f.entity.remove).toHaveBeenCalledOnce();
    f.dimension.spawnEntity.mockImplementation(() => {
      throw Error("missing asset");
    });
    expect(f.adapter.spawn(asDimensionId("overworld"), pose)).toBeUndefined();
  });
  it("recognizes occupancy and ignores unrelated or invalid entities", () => {
    const f = fixture();
    expect(f.adapter.kindOf(id)).toBe(kind);
    expect(f.adapter.isOccupied(id)).toBe(false);
    f.entity.getComponent.mockReturnValue({
      getRiders: () => [{ id: "rider" }],
    });
    expect(f.adapter.isOccupied(id)).toBe(true);
    expect(f.adapter.somethingOnTop(id)).toBe(false);
    f.entity.typeId = "minecraft:pig";
    expect(f.adapter.kindOf(id)).toBeUndefined();
    f.entity.typeId = FURNITURE_IDS[kind].entity;
    f.entity.isValid = false;
    expect(f.adapter.kindOf(id)).toBeUndefined();
  });
  it("charges and returns the matching item, with a fallback drop for server test hooks", () => {
    const f = fixture();
    const receiver = { onScreenDisplay: { setActionBar: vi.fn() } };
    game.playerById.mockReturnValue(receiver);
    game.consumeHeld.mockReturnValue(true);
    expect(f.adapter.consumeItem(player, kind, 2)).toBe(true);
    expect(game.consumeHeld).toHaveBeenCalledExactlyOnceWith(
      receiver,
      FURNITURE_IDS[kind].item,
      2,
    );
    f.adapter.dropItem(id, player);
    f.adapter.refund(player, kind, 2);
    expect(game.giveOrDrop).toHaveBeenCalledTimes(2);
    expect(game.giveOrDrop).toHaveBeenCalledWith(receiver, [
      { typeId: FURNITURE_IDS[kind].item, amount: 1 },
    ]);
    f.adapter.showHitsLeft(player, 2);
    expect(receiver.onScreenDisplay.setActionBar).toHaveBeenCalledWith({
      translate: "yasu_ride.furniture.hits_left",
      with: ["2"],
    });
    game.playerById.mockReturnValue(undefined);
    f.adapter.dropItem(id, player);
    expect(f.dimension.spawnItem).toHaveBeenCalledExactlyOnceWith(
      { typeId: FURNITURE_IDS[kind].item, amount: 1 },
      f.entity.location,
    );
  });
});
