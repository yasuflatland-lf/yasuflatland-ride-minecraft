import fc from "fast-check";
import { expect, it } from "vitest";
import { asVehicleId } from "../../../../src/domain/shared/ids";
import { MONITOR_PROPERTY_NAME } from "../../../../src/domain/vehicle/entityContract";
import { VEHICLE_KINDS } from "../../../../src/domain/vehicle/kind";
import {
  createVehicle,
  profileOf,
} from "../../../../src/domain/vehicle/kinds/index";
import { monitorScreen } from "../../../../src/domain/vehicle/monitor/monitor";
import { defined } from "../../../support/defined";
import { monitorPropertySpec } from "../../../support/monitorContract";
import { riderViews, tickSamples } from "../../../support/vehicleFuzz";
import { waterSensors } from "../../../support/waterDepth";

it.each(VEHICLE_KINDS)(
  "emits no monitor commands without a rule, or only in-range values with one for %s",
  (kind) => {
    const rule = profileOf(kind).equipment;
    const held = fc.option(
      fc.oneof(
        fc.string(),
        ...(rule?.switches.map((tool) => fc.constant(tool.item)) ?? []),
      ),
      { nil: undefined },
    );
    fc.assert(
      fc.property(
        tickSamples(kind, 30),
        fc.array(held, { minLength: 1 }),
        (samples, tools) => {
          const vehicle = createVehicle(kind, asVehicleId("v"), 0);
          samples.forEach((sample, tick) => {
            const riders = riderViews(kind, sample.riders, vehicle.yaw).map(
              (rider, index) => ({
                ...rider,
                held: { tool: tools[(tick + index) % tools.length] },
              }),
            );
            const out = vehicle.tick({
              tick,
              riders,
              testInput: sample.testInput,
              deckSeatInputs: sample.deckSeatInputs,
              velocity: sample.velocity,
              onGround: sample.onGround,
              ...waterSensors(sample.depth, sample.below),
              blockTypes: () => [],
              solidAt: () => sample.solid,
              targets: () => [],
            });
            const commands = out.stepCommands.filter(
              (c) =>
                c.type === "setProperty" && c.name === MONITOR_PROPERTY_NAME,
            );
            if (!rule) expect(commands).toEqual([]);
            else
              for (const c of commands) {
                if (c.type !== "setProperty")
                  throw new Error("Expected property command");
                const [min, max] = monitorPropertySpec(rule).range;
                expect(Number.isInteger(c.value)).toBe(true);
                expect(c.value).toBeGreaterThanOrEqual(min);
                expect(c.value).toBeLessThanOrEqual(max);
              }
          });
        },
      ),
    );
  },
);

it("maps the bulldozer road paver state to screens five and six", () => {
  const rule = defined(profileOf("bulldozer").equipment, "bulldozer monitor");
  expect(monitorPropertySpec(rule).range).toEqual([0, 6]);
  for (const [state, screen] of [
    ["off", 5],
    ["on", 6],
  ] as const)
    expect(monitorScreen(rule, "road_paver_switch", () => state)).toBe(screen);
});
