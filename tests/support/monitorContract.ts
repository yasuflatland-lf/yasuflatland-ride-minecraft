import type { PropertySpec } from "../../src/domain/vehicle/entityContract";
import type { EquipmentRule } from "../../src/domain/vehicle/equipment/equipment";
import { BLANK_SCREEN } from "../../src/domain/vehicle/monitor/monitor";

/** The non-blank screens in property order: screen k is value k + 1. */
export function monitorScreens(
  rule: EquipmentRule,
): readonly { readonly item: string; readonly state: string }[] {
  return rule.switches.flatMap(({ item, states }) =>
    states.map((state) => ({ item, state })),
  );
}

/** The spec of the core `monitor` property for this rule: int in [0, number of screens]. */
export function monitorPropertySpec(
  rule: EquipmentRule,
): Extract<PropertySpec, { type: "int" }> {
  return { type: "int", range: [BLANK_SCREEN, monitorScreens(rule).length] };
}
