import { MinecraftBlockTypes } from "@minecraft/vanilla-data";
import { expect, it } from "vitest";
import { BUILD_KEPT_BLOCKS } from "../../../src/domain/build/edit/guard";

it("lists each build-kept block once, as a real vanilla block id (ADR 0178)", () => {
  const vanilla = new Set<string>(Object.values(MinecraftBlockTypes));
  expect(new Set(BUILD_KEPT_BLOCKS).size).toBe(BUILD_KEPT_BLOCKS.length);
  for (const id of BUILD_KEPT_BLOCKS) expect(vanilla.has(id), id).toBe(true);
});
