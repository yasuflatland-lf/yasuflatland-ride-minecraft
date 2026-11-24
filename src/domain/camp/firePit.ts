import type { Brand } from "../shared/ids";
export type FirePitId = Brand<string, "FirePitId">;

export function asFirePitId(value: string): FirePitId {
  return value as FirePitId;
}

export function canToggleFirePit(lit: boolean, holdsIgniter: boolean): boolean {
  return lit || holdsIgniter;
}

export function canFoldFirePit(covered: boolean): boolean {
  return !covered;
}
