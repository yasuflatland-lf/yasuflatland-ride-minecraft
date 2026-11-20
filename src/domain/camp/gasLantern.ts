import { cellOf } from "../shared/cells";
import type { Brand } from "../shared/ids";
import type { LaidCell, LightLevel } from "../shared/laidCells";
import type { Vec3 } from "../shared/vec";
import { GAS_LANTERN_SPEC } from "./spec";

export type GasLanternId = Brand<string, "GasLanternId">;

export function asGasLanternId(value: string): GasLanternId {
  return value as GasLanternId;
}

export type GasLanternLight = LightLevel;

export function gasLanternLightCells(
  lit: boolean,
  location: Vec3,
): LaidCell<GasLanternLight>[] {
  return lit
    ? [
        {
          ...cellOf({
            ...location,
            y: location.y + GAS_LANTERN_SPEC.lightLift,
          }),
          block: { level: GAS_LANTERN_SPEC.light },
        },
      ]
    : [];
}
