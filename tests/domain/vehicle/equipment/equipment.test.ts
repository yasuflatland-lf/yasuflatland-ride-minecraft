import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  type EquipmentRule,
  equipmentBindings,
  equipmentSwitchOf,
  nextEquipmentState,
} from "../../../../src/domain/vehicle/equipment/equipment";
import { equipmentRuleArbitrary } from "./equipmentRuleArbitrary";

describe("equipment switch state", () => {
  it("reads and writes only declared states through their own bindings", () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (on, off) => {
        fc.pre(on !== off);
        const invalid = `${on}${off}invalid`;
        const states = [off, on] as const;
        const rule: EquipmentRule = {
          switches: [
            { item: "switch", states },
            { item: "unbound", states },
            { item: "constructor", states },
          ],
        };
        let current = invalid;
        const binding = {
          get: () => current,
          set: (state: string) => {
            current = state;
          },
        };
        const switches = equipmentBindings(rule, {
          switch: binding,
          extra: binding,
        });
        expect(switches.equipmentState("switch")).toBeUndefined();
        for (const state of states) {
          expect(switches.setEquipmentState("switch", state)).toBe(true);
          expect(switches.equipmentState("switch")).toBe(state);
          expect(switches.setEquipmentState("switch", invalid)).toBe(false);
          for (const item of ["extra", "unbound", "constructor", "__proto__"]) {
            expect(switches.equipmentState(item)).toBeUndefined();
            expect(switches.setEquipmentState(item, state)).toBe(false);
          }
          expect(current).toBe(state);
        }
      }),
    );
  });

  it("always advances to a member, starts at the first for missing states, and cycles back", () => {
    fc.assert(
      fc.property(equipmentRuleArbitrary, fc.string(), (rule, arbitrary) => {
        for (const equipmentSwitch of rule.switches) {
          expect(equipmentSwitch.states).toContain(
            nextEquipmentState(equipmentSwitch, arbitrary),
          );
          expect(nextEquipmentState(equipmentSwitch, undefined)).toBe(
            equipmentSwitch.states[0],
          );
          const unknown = `${equipmentSwitch.states.join("")}unknown`;
          expect(nextEquipmentState(equipmentSwitch, unknown)).toBe(
            equipmentSwitch.states[0],
          );
          for (const start of equipmentSwitch.states) {
            let state = start;
            for (let i = 0; i < equipmentSwitch.states.length; i++)
              state = nextEquipmentState(equipmentSwitch, state);
            expect(state).toBe(start);
          }
          equipmentSwitch.states.forEach((state, index) => {
            expect(nextEquipmentState(equipmentSwitch, state)).toBe(
              equipmentSwitch.states[
                (index + 1) % equipmentSwitch.states.length
              ],
            );
          });
        }
      }),
    );
  });

  it("finds exactly the declared switch and ignores unknown items or a missing rule", () => {
    fc.assert(
      fc.property(equipmentRuleArbitrary, fc.string(), (rule, item) => {
        for (const equipmentSwitch of rule.switches)
          expect(equipmentSwitchOf(rule, equipmentSwitch.item)).toBe(
            equipmentSwitch,
          );
        const found = equipmentSwitchOf(rule, item);
        expect(found !== undefined).toBe(
          rule.switches.some(
            (equipmentSwitch) => equipmentSwitch.item === item,
          ),
        );
        expect(
          equipmentSwitchOf(
            rule,
            `${rule.switches.map((equipmentSwitch) => equipmentSwitch.item).join("")}unknown`,
          ),
        ).toBeUndefined();
        expect(equipmentSwitchOf(undefined, item)).toBeUndefined();
      }),
    );
  });
});
