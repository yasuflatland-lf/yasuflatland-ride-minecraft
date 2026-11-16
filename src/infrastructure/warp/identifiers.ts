// Keep the build namespace local: warp cannot import build (ADR 0046, 0178).
const BUILD_NAMESPACE = "yasu_build";
const buildId = (name: string): string => `${BUILD_NAMESPACE}:${name}`;

export type WarpRegistryBank = 0 | 1;

export const WARP_REGISTRY_COUNT = buildId("warp_registry:count");
export const warpRegistryChunkKey = (
  bank: WarpRegistryBank,
  index: number,
): string => buildId(`warp_registry:${bank}:${index}`);
