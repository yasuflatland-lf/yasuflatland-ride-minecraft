// Build cannot be imported across feature boundaries (ADR 0046, 0178).
const WARP_NAMESPACE = "yasu_build";
const warpId = (name: string): string => `${WARP_NAMESPACE}:${name}`;

export const WARP_BLOCK_TYPE = warpId("warp_block");
export const WARP_TOOL_TYPE = warpId("warp_tool");
export const WARP_BLOCK_COMPONENT = warpId("warp_block");
