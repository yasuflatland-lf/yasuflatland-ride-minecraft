// Blocks the build tools never edit or copy (ADR 0137, 0178).
import { PLACE_KEPT_BLOCKS } from "../../shared/keptBlocks";
import type { BlockState } from "../blockState";

const WOODS = [
  "oak",
  "spruce",
  "birch",
  "jungle",
  "acacia",
  "dark_oak",
  "mangrove",
  "cherry",
  "pale_oak",
  "bamboo",
  "crimson",
  "warped",
] as const;

// Bedrock names the standing and wall signs of oak without a wood prefix and
// those of dark oak "darkoak"; the other woods follow the pattern.
const SIGNS: readonly string[] = [
  "minecraft:standing_sign",
  "minecraft:wall_sign",
  "minecraft:darkoak_standing_sign",
  "minecraft:darkoak_wall_sign",
  ...WOODS.filter((wood) => wood !== "oak" && wood !== "dark_oak").flatMap(
    (wood) => [
      `minecraft:${wood}_standing_sign`,
      `minecraft:${wood}_wall_sign`,
    ],
  ),
  ...WOODS.map((wood) => `minecraft:${wood}_hanging_sign`),
];

/** Data-holding blocks the build tools never edit or copy, on top of PLACE_KEPT_BLOCKS (ADR 0137, 0178, 0181). */
export const BUILD_KEPT_BLOCKS: readonly string[] = [
  ...SIGNS,
  "minecraft:mob_spawner",
  "minecraft:trial_spawner",
  "minecraft:vault",
  "minecraft:command_block",
  "minecraft:chain_command_block",
  "minecraft:repeating_command_block",
  "minecraft:structure_block",
  "minecraft:jigsaw",
];

const KEPT = new Set([...PLACE_KEPT_BLOCKS, ...BUILD_KEPT_BLOCKS]);

export function isKeptState(state: BlockState): boolean {
  return KEPT.has(state.typeId);
}
