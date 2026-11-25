import fc from "fast-check";
import { expect, it } from "vitest";
import { VEHICLE_KINDS } from "../../../../src/domain/vehicle/kind";
import { KINDS, profileOf } from "../../../../src/domain/vehicle/kinds/index";
import { defined } from "../../../support/defined";

it.each(VEHICLE_KINDS)(
  "reports declared switch states and rejects other items for %s with equipment",
  (kind) => {
    const rule = profileOf(kind).equipment;
    if (!rule) return;
    const drive = KINDS[kind].createDrive(0, {});
    const stateOf = defined(drive.equipmentState, "drive equipmentState").bind(
      drive,
    );
    for (const equipmentSwitch of rule.switches)
      expect(equipmentSwitch.states).toContain(stateOf(equipmentSwitch.item));
    const unknown = fc
      .oneof(fc.string(), fc.constantFrom("constructor", "__proto__"))
      .filter(
        (item) =>
          !rule.switches.some(
            (equipmentSwitch) => equipmentSwitch.item === item,
          ),
      );
    fc.assert(
      fc.property(unknown, (item) => {
        expect(stateOf(item)).toBeUndefined();
      }),
    );
  },
);
