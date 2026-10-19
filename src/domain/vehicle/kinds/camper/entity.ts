import type { EntityContract } from "../../entityContract";
import {
  TRANSFORMING_EVENTS,
  transformingProperties,
} from "../../motion/transformingEntity";
import { CAMPER_SPEC } from "./spec";

export const CAMPER_ENTITY = {
  properties: transformingProperties(CAMPER_SPEC.maxBank),
  events: TRANSFORMING_EVENTS,
  animations: [],
  restored: ["form"],
} as const satisfies EntityContract;
