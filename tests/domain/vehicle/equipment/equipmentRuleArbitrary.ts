import fc from "fast-check";
import type { EquipmentRule } from "../../../../src/domain/vehicle/equipment/equipment";

export const equipmentRuleArbitrary = fc
  .uniqueArray(
    fc.record({
      item: fc.string({ minLength: 1 }),
      states: fc
        .uniqueArray(fc.string(), { minLength: 1, maxLength: 5 })
        .map((states) => states as [string, ...string[]]),
    }),
    {
      selector: (equipmentSwitch) => equipmentSwitch.item,
      minLength: 1,
      maxLength: 5,
    },
  )
  .map((switches): EquipmentRule => ({ switches }));
