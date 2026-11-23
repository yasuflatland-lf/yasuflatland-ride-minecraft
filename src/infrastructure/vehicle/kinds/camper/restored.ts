import type { Entity } from "@minecraft/server";
import type { DockBlock } from "../../../../domain/vehicle/dock/floor";
import {
  CAMPER_SAVED,
  type RestoredValues,
} from "../../../../domain/vehicle/kinds/index";
import type { CellCodec } from "../../../shared/laidCells";
import { savedDecor } from "./bedrockDecorWorld";
import { savedDock } from "./dockBlocks";

/** The camper's saved room values: laid and door state from its laid cells, decor from its decor property. */
export function readCamperRestored(
  vehicle: Entity,
  codec: CellCodec<DockBlock>,
): RestoredValues {
  const dock = savedDock(vehicle, codec);
  return {
    [CAMPER_SAVED.laid]: dock.laid,
    [CAMPER_SAVED.doorOpen]: dock.doorOpen,
    [CAMPER_SAVED.decor]: savedDecor(vehicle),
  };
}
