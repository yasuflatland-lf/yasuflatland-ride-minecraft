// Keep the build namespace local: warp cannot import build (ADR 0046, 0178).
const WARP_NAMESPACE = "yasu_build";
const warpId = (name: string): string => `${WARP_NAMESPACE}:${name}`;

export const WARP_BLOCK_TYPE = warpId("warp_block");
export const WARP_TOOL_TYPE = warpId("warp_tool");
export const WARP_BLOCK_COMPONENT = warpId("warp_block");

export type WarpRegistryBank = 0 | 1;

export const WARP_REGISTRY_COUNT = warpId("warp_registry:count");
export const warpRegistryChunkKey = (
  bank: WarpRegistryBank,
  index: number,
): string => warpId(`warp_registry:${bank}:${index}`);
