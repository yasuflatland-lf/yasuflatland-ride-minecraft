import { world } from "@minecraft/server";
import type { WarpRegistryStore } from "../../../application/warp/ports/registryStore";
import { parseSnapshot, toSnapshot } from "../../../domain/warp/snapshot";
import {
  emptyRegistry,
  type WarpRegistry,
} from "../../../domain/warp/warpRegistry";
import {
  WARP_REGISTRY_COUNT,
  type WarpRegistryBank,
  warpRegistryChunkKey,
} from "../identifiers";
import { chunkString, joinChunks } from "./chunks";

// Allow up to three UTF-8 bytes per UTF-16 code unit within the property limit.
const CHUNK_SIZE = 10_000;

interface Published {
  bank: WarpRegistryBank;
  count: number;
}

// The published value is "<bank>:<count>". One write switches both the bank
// and the chunk count, so readers never see chunks from two saves mixed.
function parsePublished(value: unknown): Published | undefined {
  if (typeof value !== "string") return undefined;
  const match = /^([01]):(0|[1-9]\d*)$/.exec(value);
  if (!match) return undefined;
  const count = Number(match[2]);
  if (!Number.isSafeInteger(count)) return undefined;
  return { bank: match[1] === "1" ? 1 : 0, count };
}

export class DynamicPropertyWarpRegistryStore implements WarpRegistryStore {
  load(): WarpRegistry | undefined {
    const raw = world.getDynamicProperty(WARP_REGISTRY_COUNT);
    if (raw === undefined) return emptyRegistry();
    const published = parsePublished(raw);
    if (!published) return undefined;
    const chunks: string[] = [];
    for (let index = 0; index < published.count; index++) {
      const chunk = world.getDynamicProperty(
        warpRegistryChunkKey(published.bank, index),
      );
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
    const previous = parsePublished(
      world.getDynamicProperty(WARP_REGISTRY_COUNT),
    );
    // Write into the bank the published value does not reference, so a failed
    // write leaves the published registry intact.
    const bank: WarpRegistryBank = previous?.bank === 0 ? 1 : 0;
    for (const [index, chunk] of chunks.entries()) {
      world.setDynamicProperty(warpRegistryChunkKey(bank, index), chunk);
    }
    world.setDynamicProperty(WARP_REGISTRY_COUNT, `${bank}:${chunks.length}`);
    if (previous) {
      for (let index = 0; index < previous.count; index++) {
        world.setDynamicProperty(
          warpRegistryChunkKey(previous.bank, index),
          undefined,
        );
      }
    }
  }
}
