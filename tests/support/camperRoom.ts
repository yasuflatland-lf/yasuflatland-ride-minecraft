import type { Drive } from "../../src/domain/vehicle/drive";
import { CAMPER_ROOM } from "../../src/domain/vehicle/kinds/index";
import { defined } from "./defined";

export function camperRoom(drive: Drive) {
  return defined(drive.capability?.(CAMPER_ROOM), "camper room");
}
