import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  BLANK_SCREEN,
  type MonitorRule,
  monitorPropertySpec,
  monitorScreen,
  monitorScreens,
} from "../../../../src/domain/vehicle/monitor/monitor";

const ruleArbitrary = fc
  .uniqueArray(
    fc.record({
      item: fc.string({ minLength: 1 }),
      states: fc.uniqueArray(fc.string(), { minLength: 1, maxLength: 5 }),
    }),
    { selector: (tool) => tool.item, minLength: 1, maxLength: 5 },
  )
  .map((tools): MonitorRule => ({ group: "tools", tools }));

describe("cab monitor screens", () => {
  it("assigns every tool state a distinct screen in property order and range", () => {
    fc.assert(
      fc.property(ruleArbitrary, (rule) => {
        const screens = monitorScreens(rule);
        const spec = monitorPropertySpec(rule);
        expect(spec).toEqual({ type: "int", range: [0, screens.length] });
        const values = rule.tools.flatMap((tool) =>
          tool.states.map((state) => {
            const value = monitorScreen(rule, tool.item, () => state);
            expect(value).toBeGreaterThanOrEqual(1);
            expect(value).toBeLessThanOrEqual(spec.range[1]);
            expect(screens[value - 1]).toEqual({ item: tool.item, state });
            return value;
          }),
        );
        expect(values).toEqual(screens.map((_, index) => index + 1));
        expect(new Set(values).size).toBe(screens.length);
      }),
    );
  });

  it("blanks missing tools and unknown states, including prototype names", () => {
    fc.assert(
      fc.property(ruleArbitrary, fc.string(), (rule, arbitrary) => {
        const missing = [arbitrary, "constructor", "__proto__"].filter(
          (item) => !rule.tools.some((tool) => tool.item === item),
        );
        expect(monitorScreen(rule, undefined, () => "anything")).toBe(
          BLANK_SCREEN,
        );
        for (const item of missing)
          expect(monitorScreen(rule, item, () => "anything")).toBe(
            BLANK_SCREEN,
          );
        for (const tool of rule.tools) {
          expect(monitorScreen(rule, tool.item, () => undefined)).toBe(
            BLANK_SCREEN,
          );
          const unknown = `${tool.states.join("")}unknown`;
          expect(monitorScreen(rule, tool.item, () => unknown)).toBe(
            BLANK_SCREEN,
          );
        }
        expect(BLANK_SCREEN).toBe(0);
      }),
    );
  });

  it("keeps all earlier values when a tool is appended", () => {
    fc.assert(
      fc.property(
        ruleArbitrary,
        fc.string({ minLength: 1 }),
        (rule, suffix) => {
          const item = rule.tools.map((tool) => tool.item).join("") + suffix;
          const extended = {
            ...rule,
            tools: [...rule.tools, { item, states: ["new"] }],
          };
          for (const tool of rule.tools)
            for (const state of tool.states)
              expect(monitorScreen(extended, tool.item, () => state)).toBe(
                monitorScreen(rule, tool.item, () => state),
              );
        },
      ),
    );
  });

  it("maps a bulldozer-shaped blade switch to down then up", () => {
    const rule = {
      group: "tools",
      tools: [{ item: "blade_switch", states: ["down", "up"] }],
    };
    expect(monitorScreen(rule, "blade_switch", () => "down")).toBe(1);
    expect(monitorScreen(rule, "blade_switch", () => "up")).toBe(2);
  });
});
