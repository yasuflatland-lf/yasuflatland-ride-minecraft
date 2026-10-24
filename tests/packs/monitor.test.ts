import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MONITOR_PROPERTY_NAME } from "../../src/domain/vehicle/entityContract";
import { VEHICLE_KINDS } from "../../src/domain/vehicle/kind";
import { profileOf } from "../../src/domain/vehicle/kinds/index";
import {
  monitorPropertySpec,
  monitorScreens,
} from "../../src/domain/vehicle/monitor/monitor";
import { entityPropertyId } from "../../src/infrastructure/vehicle/bedrock/identifiers";
import { expectPackProperty } from "../support/entityContract";

const screens: Record<string, { item: string; state: string }[]> = JSON.parse(
  readFileSync("tools/monitor_screens.json", "utf8"),
);

function properties(kind: string): Record<string, Record<string, unknown>> {
  return JSON.parse(
    readFileSync(
      `packs/yasu_ride_bp/entities/yasu_ride/${kind}.se.json`,
      "utf8",
    ),
  )["minecraft:entity"].description.properties;
}

describe.each(VEHICLE_KINDS)("the %s cab monitor (ADR 0139)", (kind) => {
  const rule = profileOf(kind).monitor;
  const definition = properties(kind)[entityPropertyId(MONITOR_PROPERTY_NAME)];

  it("declares the monitor property exactly when the kind has a rule", () => {
    expect(definition !== undefined).toBe(rule !== undefined);
  });

  it.runIf(rule)("declares the property range from the rule", () => {
    if (!rule || !definition) throw new Error("Missing monitor rule");
    const spec = monitorPropertySpec(rule);
    expect(definition).toMatchObject(spec);
    expectPackProperty(definition, spec);
    expect(definition.default).toBe(0);
    expect(definition.client_sync).toBe(true);
  });

  it.runIf(rule)("draws the rule's screens in property order", () => {
    if (!rule) throw new Error("Missing monitor rule");
    expect(
      (screens[kind] ?? []).map(({ item, state }) => ({ item, state })),
    ).toEqual(monitorScreens(rule));
  });

  it.runIf(rule)("has no duplicate items or states", () => {
    if (!rule) throw new Error("Missing monitor rule");
    const items = rule.tools.map((t) => t.item);
    expect(new Set(items).size).toBe(items.length);
    for (const { states } of rule.tools)
      expect(new Set(states).size).toBe(states.length);
  });
});
