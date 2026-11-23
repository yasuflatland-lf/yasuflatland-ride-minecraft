import { cellCenter } from "../../src/domain/shared/cells";
import type { HoldPose } from "../../src/domain/vehicle/dock/floor";
import type { Drive } from "../../src/domain/vehicle/drive";
import { roomCells } from "../../src/domain/vehicle/kinds/camper/roomCells";
import { CAMPER_ROOM } from "../../src/domain/vehicle/kinds/index";
import { defined } from "./defined";

export function camperRoom(drive: Drive) {
  return defined(drive.capability?.(CAMPER_ROOM), "camper room");
}

export function showerFeet(pose: HoldPose) {
  return cellCenter(
    defined(
      roomCells(pose, false).find(({ block }) => block.type === "showerToilet"),
      "shower-toilet cell",
    ),
  );
}
