import type { Brand } from "../shared/ids";
export type FirePitId = Brand<string, "FirePitId">;

export function asFirePitId(value: string): FirePitId {
  return value as FirePitId;
}

export function canToggleFirePit(
  lit: boolean,
  heldItem: string | undefined,
): boolean {
  return lit || heldItem === "minecraft:flint_and_steel";
}

export function canFoldFirePit(covered: boolean): boolean {
  return !covered;
}
