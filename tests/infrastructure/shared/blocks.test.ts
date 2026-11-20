import type { Dimension } from "@minecraft/server";
import { describe, expect, it, vi } from "vitest";
import { chunkLoadedAt } from "../../../src/infrastructure/shared/blocks";

vi.mock("@minecraft/server", () => ({}));

describe("chunkLoadedAt", () => {
  const location = { x: 1.5, y: 64, z: -2.5 };

  it.each([
    ["a defined block", {}, true],
    ["an undefined block", undefined, false],
  ])("handles %s", (_name, block, expected) => {
    const getBlock = vi.fn(() => block);
    expect(chunkLoadedAt({ getBlock } as unknown as Dimension, location)).toBe(
      expected,
    );
    expect(getBlock).toHaveBeenCalledExactlyOnceWith(location);
  });

  it("returns false when the block read throws", () => {
    const getBlock = vi.fn(() => {
      throw new Error("unloaded");
    });
    expect(chunkLoadedAt({ getBlock } as unknown as Dimension, location)).toBe(
      false,
    );
    expect(getBlock).toHaveBeenCalledExactlyOnceWith(location);
  });
});
