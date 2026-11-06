import type { PropertySpec } from "../../src/domain/vehicle/entityContract";
import {
  BLANK_SCREEN,
  type MonitorRule,
} from "../../src/domain/vehicle/monitor/monitor";

/** The non-blank screens in property order: screen k is value k + 1. */
export function monitorScreens(
  rule: MonitorRule,
): readonly { readonly item: string; readonly state: string }[] {
  return rule.tools.flatMap(({ item, states }) =>
    states.map((state) => ({ item, state })),
  );
}

/** The spec of the core `monitor` property for this rule: int in [0, number of screens]. */
export function monitorPropertySpec(
  rule: MonitorRule,
): Extract<PropertySpec, { type: "int" }> {
  return { type: "int", range: [BLANK_SCREEN, monitorScreens(rule).length] };
}
