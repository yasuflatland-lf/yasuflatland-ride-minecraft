import { MinecraftBlockTypes } from "@minecraft/vanilla-data";
import { expect, it } from "vitest";
import { CUT_KEPT_BLOCKS } from "../../../src/domain/vehicle/cut";

it("lists each kept block once, as a real vanilla block id (ADR 0137)", () => {
  const vanilla = new Set<string>(Object.values(MinecraftBlockTypes));
  expect(new Set(CUT_KEPT_BLOCKS).size).toBe(CUT_KEPT_BLOCKS.length);
  for (const id of CUT_KEPT_BLOCKS) expect(vanilla.has(id), id).toBe(true);
});
it("keeps air, the liquids, and every block that holds items (ADR 0137)", () => {
  expect(CUT_KEPT_BLOCKS).toHaveLength(61);
  expect(CUT_KEPT_BLOCKS).toEqual(
    expect.arrayContaining(
      [
        "air",
        "water",
        "flowing_water",
        "lava",
        "flowing_lava",
        "chest",
        "trapped_chest",
        "ender_chest",
        "barrel",
        "undyed_shulker_box",
        "white_shulker_box",
        "black_shulker_box",
        "furnace",
        "lit_furnace",
        "blast_furnace",
        "lit_blast_furnace",
        "smoker",
        "lit_smoker",
        "hopper",
        "dropper",
        "dispenser",
        "crafter",
        "brewing_stand",
        "chiseled_bookshelf",
        "decorated_pot",
        "lectern",
        "jukebox",
        "copper_chest",
        "waxed_oxidized_copper_chest",
        "oak_shelf",
        "warped_shelf",
      ].map((id) => `minecraft:${id}`),
    ),
  );
});
it("cuts bedrock, technical, unbreakable, and light blocks (ADR 0137)", () => {
  for (const id of [
    "bedrock",
    "barrier",
    "command_block",
    "structure_block",
    "end_portal_frame",
    "reinforced_deepslate",
    "light_block_15",
  ])
    expect(CUT_KEPT_BLOCKS).not.toContain(`minecraft:${id}`);
});
