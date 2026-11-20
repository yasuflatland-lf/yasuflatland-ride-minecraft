import { describe, expect, it, vi } from "vitest";
import { asDimensionId } from "../../../src/domain/shared/ids";
import { dimensionById } from "../../../src/infrastructure/shared/dimensions";

const game = vi.hoisted(() => ({ getDimension: vi.fn() }));
vi.mock("@minecraft/server", () => ({
  world: { getDimension: game.getDimension },
}));

describe("dimensionById", () => {
  it("returns the dimension for a known id", () => {
    const dimension = { id: "minecraft:overworld" };
    game.getDimension.mockReset().mockReturnValue(dimension);
    expect(dimensionById(asDimensionId(dimension.id))).toBe(dimension);
    expect(game.getDimension).toHaveBeenCalledExactlyOnceWith(dimension.id);
  });

  it("returns undefined when the lookup throws", () => {
    game.getDimension.mockReset().mockImplementation(() => {
      throw new Error("unknown dimension");
    });
    expect(dimensionById(asDimensionId("unknown"))).toBeUndefined();
    expect(game.getDimension).toHaveBeenCalledExactlyOnceWith("unknown");
  });
});
