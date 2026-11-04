import type { Brand } from "../shared/ids";
import type { LaidCell } from "../shared/laidCells";
import type { Vec3 } from "../shared/vec";
import { GAS_LANTERN_SPEC } from "./spec";

export type GasLanternId = Brand<string, "GasLanternId">;

export function asGasLanternId(value: string): GasLanternId {
  return value as GasLanternId;
}

export interface GasLanternLight {
  readonly level: number;
}

export function gasLanternLightCells(
  lit: boolean,
  location: Vec3,
): LaidCell<GasLanternLight>[] {
  return lit
    ? [
        {
          x: Math.floor(location.x),
          y: Math.floor(location.y + GAS_LANTERN_SPEC.lightLift),
          z: Math.floor(location.z),
          block: { level: GAS_LANTERN_SPEC.light },
        },
      ]
    : [];
}
