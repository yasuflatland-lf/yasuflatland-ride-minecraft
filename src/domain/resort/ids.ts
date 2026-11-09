import type { Brand } from "../shared/ids";

export type ParasolId = Brand<string, "ParasolId">;

export function asParasolId(raw: string): ParasolId {
  return raw as ParasolId;
}
