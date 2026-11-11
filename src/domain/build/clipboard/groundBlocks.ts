import { CLEARABLE_DECORATIONS } from "../../shared/decorations";
import { isOpenBlock } from "../../shared/keptBlocks";

// Parking keeps planted cover, but paste ground must also skip replaceable plants.
const REPLACEABLE_PLANTS = new Set([
  "minecraft:vine",
  "minecraft:glow_lichen",
  "minecraft:hanging_roots",
  "minecraft:torchflower",
  "minecraft:pitcher_plant",
  "minecraft:seagrass",
  "minecraft:tall_seagrass",
  "minecraft:waterlily",
  "minecraft:crimson_roots",
  "minecraft:warped_roots",
  "minecraft:nether_sprouts",
]);

export function isGroundBlock(typeId: string): boolean {
  return (
    !isOpenBlock(typeId) &&
    !CLEARABLE_DECORATIONS.has(typeId) &&
    !REPLACEABLE_PLANTS.has(typeId)
  );
}
