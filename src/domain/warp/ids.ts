import type { Brand } from "../shared/ids";

export type WarpPointId = Brand<string, "WarpPointId">;

export function asWarpPointId(raw: string): WarpPointId {
  return raw as WarpPointId;
}
