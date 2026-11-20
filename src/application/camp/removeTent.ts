import { legacyTentClearCells } from "../../domain/camp/legacyTent";
import type { TentId } from "../../domain/camp/tent";
import type { TentEntry } from "../../domain/camp/tentRegistry";
import type { TentRemovalWorld } from "./ports/tentRemoval";

export function removeTent(
  world: TentRemovalWorld,
  tentId: TentId,
  legacy?: TentEntry,
): void {
  const loaded = world.entityLoaded(tentId);
  world.unlayBlocks(tentId);
  if (legacy) {
    world.clearTentBlocks(
      legacy.dimensionId,
      legacyTentClearCells(legacy.pose),
    );
  } else if (!loaded) {
    // Hits can count from the registry after a reload or restart, before the
    // entity loads and the cell layer has any saved cells to clear.
    world.clearBlocksByPose(tentId);
  }
  world.removeTent(tentId);
}
