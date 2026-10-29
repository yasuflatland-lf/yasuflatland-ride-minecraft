import { beforeEach, describe, expect, it, vi } from "vitest";
import { asPlayerId } from "../../../src/domain/shared/ids";
import { playerById } from "../../../src/infrastructure/shared/players";

const game = vi.hoisted(() => ({ getEntity: vi.fn() }));
vi.mock("@minecraft/server", () => ({
  GameMode: { Creative: "Creative" },
  world: { getEntity: game.getEntity },
}));

const id = asPlayerId("-42");

function entity(typeId: string) {
  return Object.defineProperty({ typeId }, "isValid", {
    get: () => {
      throw new Error("isValid read");
    },
  });
}

beforeEach(() => game.getEntity.mockReset());

describe("playerById", () => {
  it("returns the entity when it is a player, without reading isValid", () => {
    const player = entity("minecraft:player");
    game.getEntity.mockReturnValue(player);
    expect(playerById(id)).toBe(player);
    expect(game.getEntity).toHaveBeenCalledWith(id);
  });

  it("returns undefined for an entity of another type", () => {
    game.getEntity.mockReturnValue(entity("minecraft:zombie"));
    expect(playerById(id)).toBeUndefined();
  });

  it("returns undefined for a missing entity", () => {
    game.getEntity.mockReturnValue(undefined);
    expect(playerById(id)).toBeUndefined();
  });
});
