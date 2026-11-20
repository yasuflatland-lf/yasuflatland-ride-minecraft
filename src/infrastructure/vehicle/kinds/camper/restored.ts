import type { Entity } from "@minecraft/server";
import {
  CAMPER_SAVED,
  type RestoredValues,
} from "../../../../domain/vehicle/kinds/index";
import { savedDecor } from "../../bedrock/bedrockDecorWorld";
import { savedDock } from "./dockBlocks";

/** The camper's saved room values: laid and door state from its laid cells, decor from its decor property. */
export function readCamperRestored(vehicle: Entity): RestoredValues {
  const dock = savedDock(vehicle);
  return {
    [CAMPER_SAVED.laid]: dock.laid,
    [CAMPER_SAVED.doorOpen]: dock.doorOpen,
    [CAMPER_SAVED.decor]: savedDecor(vehicle),
  };
}
