import { PAINT_EVENT_PREFIX } from "../../src/domain/shared/paint";
import {
  HEADLIGHTS_PROPERTY_NAME,
  MONITOR_PROPERTY_NAME,
} from "../../src/domain/vehicle/entityContract";

/** Names the core writes; no kind may declare them. */
export const CORE_PROPERTY_NAMES: readonly string[] = [
  HEADLIGHTS_PROPERTY_NAME,
  MONITOR_PROPERTY_NAME,
];
export const CORE_EVENT_PREFIXES: readonly string[] = [PAINT_EVENT_PREFIX];
