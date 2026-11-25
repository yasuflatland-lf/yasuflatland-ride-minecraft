import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { EquipmentRule } from "../../../../src/domain/vehicle/equipment/equipment";
import {
  BLANK_SCREEN,
  monitorScreen,
} from "../../../../src/domain/vehicle/monitor/monitor";
import {
  monitorPropertySpec,
  monitorScreens,
} from "../../../support/monitorContract";
import { equipmentRuleArbitrary } from "../equipment/equipmentRuleArbitrary";

describe("cab monitor screens", () => {
  it("assigns every switch state a distinct screen in property order and range", () => {
    fc.assert(
      fc.property(equipmentRuleArbitrary, (rule) => {
        const screens = monitorScreens(rule);
        const spec = monitorPropertySpec(rule);
        expect(spec).toEqual({ type: "int", range: [0, screens.length] });
        const values = rule.switches.flatMap((equipmentSwitch) =>
          equipmentSwitch.states.map((state) => {
            const value = monitorScreen(
              rule,
              equipmentSwitch.item,
              () => state,
            );
            expect(value).toBeGreaterThanOrEqual(1);
            expect(value).toBeLessThanOrEqual(spec.range[1]);
            expect(screens[value - 1]).toEqual({
              item: equipmentSwitch.item,
              state,
            });
            return value;
          }),
        );
        expect(values).toEqual(screens.map((_, index) => index + 1));
        expect(new Set(values).size).toBe(screens.length);
      }),
    );
  });

  it("blanks missing switches and unknown states, including prototype names", () => {
    fc.assert(
      fc.property(equipmentRuleArbitrary, fc.string(), (rule, arbitrary) => {
        const missing = [arbitrary, "constructor", "__proto__"].filter(
          (item) =>
            !rule.switches.some(
              (equipmentSwitch) => equipmentSwitch.item === item,
            ),
        );
        expect(monitorScreen(rule, undefined, () => "anything")).toBe(
          BLANK_SCREEN,
        );
        for (const item of missing)
          expect(monitorScreen(rule, item, () => "anything")).toBe(
            BLANK_SCREEN,
          );
        for (const equipmentSwitch of rule.switches) {
          expect(
            monitorScreen(rule, equipmentSwitch.item, () => undefined),
          ).toBe(BLANK_SCREEN);
          const unknown = `${equipmentSwitch.states.join("")}unknown`;
          expect(monitorScreen(rule, equipmentSwitch.item, () => unknown)).toBe(
            BLANK_SCREEN,
          );
        }
      }),
    );
  });

  it("keeps all earlier values when a switch is appended", () => {
    fc.assert(
      fc.property(
        equipmentRuleArbitrary,
        fc.string({ minLength: 1 }),
        (rule, suffix) => {
          const item =
            rule.switches
              .map((equipmentSwitch) => equipmentSwitch.item)
              .join("") + suffix;
          const extended = {
            ...rule,
            switches: [...rule.switches, { item, states: ["new"] as [string] }],
          };
          for (const equipmentSwitch of rule.switches)
            for (const state of equipmentSwitch.states)
              expect(
                monitorScreen(extended, equipmentSwitch.item, () => state),
              ).toBe(monitorScreen(rule, equipmentSwitch.item, () => state));
        },
      ),
    );
  });

  it("maps a bulldozer-shaped blade switch to down then up", () => {
    const rule: EquipmentRule = {
      switches: [{ item: "blade_switch", states: ["down", "up"] }],
    };
    expect(monitorScreen(rule, "blade_switch", () => "down")).toBe(1);
    expect(monitorScreen(rule, "blade_switch", () => "up")).toBe(2);
  });
});
