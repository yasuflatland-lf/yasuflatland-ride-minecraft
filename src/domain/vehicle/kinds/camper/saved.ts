import type { RestoredValues } from "../../drive";
import type { CAMPER_ENTITY } from "./entity";

/** Room values the camper's infrastructure reads from dynamic properties (ADR 0068, 0093). */
export const CAMPER_SAVED = Object.freeze({
  laid: "dockLaid",
  doorOpen: "dockDoorOpen",
  decor: "dockDecor",
} as const);

type CamperSavedKey = (typeof CAMPER_SAVED)[keyof typeof CAMPER_SAVED];

export type CamperRestored = RestoredValues<
  (typeof CAMPER_ENTITY)["restored"][number] | CamperSavedKey
>;
