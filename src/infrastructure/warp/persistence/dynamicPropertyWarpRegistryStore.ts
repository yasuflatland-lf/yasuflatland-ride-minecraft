import { world } from "@minecraft/server";
import type { WarpRegistryStore } from "../../../application/warp/ports/registryStore";
import { parseSnapshot, toSnapshot } from "../../../domain/warp/snapshot";
import {
  emptyRegistry,
  type WarpRegistry,
} from "../../../domain/warp/warpRegistry";
import { WARP_REGISTRY_COUNT, warpRegistryChunkKey } from "../identifiers";
import { chunkString, joinChunks } from "./chunks";

// Allow up to three UTF-8 bytes per UTF-16 code unit within the property limit.
const CHUNK_SIZE = 10_000;

function isChunkCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export class DynamicPropertyWarpRegistryStore implements WarpRegistryStore {
  load(): WarpRegistry | undefined {
    const count = world.getDynamicProperty(WARP_REGISTRY_COUNT);
    if (count === undefined) return emptyRegistry();
    if (!isChunkCount(count)) return undefined;
    const chunks: string[] = [];
    for (let index = 0; index < count; index++) {
      const chunk = world.getDynamicProperty(warpRegistryChunkKey(index));
      if (typeof chunk !== "string") return undefined;
      chunks.push(chunk);
    }
    try {
      return parseSnapshot(JSON.parse(joinChunks(chunks)));
    } catch {
      return undefined;
    }
  }

  save(registry: WarpRegistry): void {
    const chunks = chunkString(
      JSON.stringify(toSnapshot(registry)),
      CHUNK_SIZE,
    );
    const previousCount = world.getDynamicProperty(WARP_REGISTRY_COUNT);
    for (const [index, chunk] of chunks.entries()) {
      world.setDynamicProperty(warpRegistryChunkKey(index), chunk);
    }
    // Publish the count only after every chunk write succeeds. Existing chunk
    // keys are reused, so this ordering cannot make overwrites atomic.
    world.setDynamicProperty(WARP_REGISTRY_COUNT, chunks.length);
    if (isChunkCount(previousCount)) {
      for (let index = chunks.length; index < previousCount; index++) {
        world.setDynamicProperty(warpRegistryChunkKey(index), undefined);
      }
    }
  }
}
