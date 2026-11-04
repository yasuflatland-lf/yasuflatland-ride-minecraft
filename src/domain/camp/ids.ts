import type { Brand } from "../shared/ids";
export type RoofTentId = Brand<string, "RoofTentId">;

export function asRoofTentId(raw: string): RoofTentId {
  return raw as RoofTentId;
}
