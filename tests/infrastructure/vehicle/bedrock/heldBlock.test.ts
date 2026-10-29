import { BlockPermutation } from "@minecraft/server";
import { beforeEach, expect, it, vi } from "vitest";
import { riderHeldOf } from "../../../../src/infrastructure/vehicle/bedrock/heldBlock";

vi.mock("@minecraft/server", () => ({
  BlockPermutation: {
    resolve: vi.fn((typeId: string) => {
      if (typeId.startsWith("yasu_ride:")) throw new Error("Not a block");
      return {};
    }),
  },
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

it("derives the block from a Minecraft block item", () => {
  expect(riderHeldOf("minecraft:stone")).toEqual({
    tool: undefined,
    block: "minecraft:stone",
  });
});

it("derives the monitor tool from a switch item", () => {
  expect(riderHeldOf("yasu_ride:blade_switch")).toEqual({
    tool: "blade_switch",
    block: undefined,
  });
});

it("leaves an empty hand undefined without resolving a block", () => {
  expect(riderHeldOf(undefined)).toBeUndefined();
  expect(BlockPermutation.resolve).not.toHaveBeenCalled();
});

it.each(["minecraft:dirt", "yasu_ride:icebreaker_switch"])(
  "caches both successful and failed resolutions: %s",
  async (typeId) => {
    const { riderHeldOf: heldOf } = await import(
      "../../../../src/infrastructure/vehicle/bedrock/heldBlock"
    );
    const first = heldOf(typeId);
    expect(heldOf(typeId)).toEqual(first);
    expect(BlockPermutation.resolve).toHaveBeenCalledExactlyOnceWith(typeId);
  },
);
