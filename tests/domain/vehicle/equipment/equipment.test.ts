import fc from "fast-check";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  defineEquipmentSwitch,
  equipmentBindings,
  nextEquipmentState,
} from "../../../../src/domain/vehicle/equipment/equipment";
import { equipmentRuleArbitrary } from "./equipmentRuleArbitrary";

describe("equipment switch state", () => {
  it("reads and writes only declared states through their own bindings", () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (on, off) => {
        fc.pre(on !== off);
        const equipmentSwitch = defineEquipmentSwitch("switch", [off, on]);
        const unbound = defineEquipmentSwitch("unbound", [off, on]);
        const extra = defineEquipmentSwitch("extra", [off, on]);
        let current = off;
        const switches = equipmentBindings(
          { switches: [equipmentSwitch, unbound] },
          [
            {
              switch: equipmentSwitch,
              get: () => current,
              set: (state) => {
                current = state;
              },
            },
            { switch: extra, get: () => off, set: () => {} },
          ],
        );
        const invalid = `${on}${off}invalid`;
        for (const [state, next] of [
          [off, on],
          [on, off],
        ] as const) {
          expect(switches.forceEquipment(equipmentSwitch, state)).toBe(true);
          expect(switches.equipmentState(equipmentSwitch)).toBe(state);
          expect(switches.forceEquipment(equipmentSwitch, invalid)).toBe(false);
          expect(current).toBe(state);
          for (const unsupported of [unbound, extra]) {
            expect(switches.equipmentState(unsupported)).toBeUndefined();
            expect(switches.forceEquipment(unsupported, state)).toBe(false);
            expect(switches.cycleEquipment(unsupported)).toBe(false);
          }
          expect(switches.cycleEquipment(equipmentSwitch)).toBe(true);
          expect(current).toBe(next);
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
            const visited = new Set<string>();
            for (const _ of equipmentSwitch.states) {
              visited.add(state);
              state = nextEquipmentState(equipmentSwitch, state);
            }
            expect(visited).toEqual(new Set(equipmentSwitch.states));
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

  it("infers each binding's state type from its own switch", () => {
    const power = defineEquipmentSwitch("power", ["off", "on"]);
    const blade = defineEquipmentSwitch("blade", ["down", "up"]);
    const switches = equipmentBindings({ switches: [power, blade] }, [
      {
        switch: power,
        get: () => "off",
        set: (state) => {
          expectTypeOf(state).toEqualTypeOf<"off" | "on">();
        },
      },
      {
        switch: blade,
        get: () => "down",
        set: (state) => {
          expectTypeOf(state).toEqualTypeOf<"down" | "up">();
        },
      },
    ]);
    expectTypeOf(switches.equipmentState(blade)).toEqualTypeOf<
      "down" | "up" | undefined
    >();
    expect(switches.cycleEquipment(power)).toBe(true);
    expect(switches.cycleEquipment(blade)).toBe(true);
  });
});
