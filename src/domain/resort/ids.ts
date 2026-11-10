import type { Brand } from "../shared/ids";

export type ParasolId = Brand<string, "ParasolId">;

export function asParasolId(raw: string): ParasolId {
  return raw as ParasolId;
}

export type BeachChairId = Brand<string, "BeachChairId">;

export function asBeachChairId(raw: string): BeachChairId {
  return raw as BeachChairId;
}

export type FurnitureId = Brand<string, "FurnitureId">;

export function asFurnitureId(raw: string): FurnitureId {
  return raw as FurnitureId;
}
