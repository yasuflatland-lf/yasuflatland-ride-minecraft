import type { Player } from "@minecraft/server";
import { heldTypeId } from "../../shared/heldItem";
import { buildItemRole } from "../identifiers";

export function heldBuildItem(player: Player) {
  return buildItemRole(heldTypeId(player));
}
