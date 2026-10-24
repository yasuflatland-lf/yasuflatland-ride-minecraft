import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { asPlayerId, asVehicleId } from "../../../../src/domain/shared/ids";
import type {
  Drive,
  EngineCommand,
} from "../../../../src/domain/vehicle/drive";
import { MONITOR_PROPERTY_NAME } from "../../../../src/domain/vehicle/entityContract";
import {
  BLADE_SWITCH_ITEM,
  createVehicle,
  profileOf,
} from "../../../../src/domain/vehicle/kinds/index";
import type { VehicleProfile } from "../../../../src/domain/vehicle/profile";
import {
  type RiderView,
  Vehicle,
  type VehicleTickInput,
} from "../../../../src/domain/vehicle/vehicle";
import { defined } from "../../../support/defined";
import { waterSensors } from "../../../support/waterDepth";

const profile: VehicleProfile = {
  ...profileOf("suv"),
  monitor: {
    group: "tools",
    tools: [{ item: "switch", states: ["down", "up"] }],
  },
};
const driveCommand: EngineCommand = {
  type: "setProperty",
  name: "bank",
  value: 0,
};

function rider(seat: number, heldTool?: string): RiderView {
  const at = defined(profile.seats.positions[seat], "seat");
  return {
    id: asPlayerId(`r${seat}`),
    offset: { x: at.x, z: -at.z },
    yaw: 0,
    raw: { moveX: 0, moveY: 0, jump: false },
    slot: seat,
    heldTool,
  };
}

function tickInput(
  tick: number,
  riders: readonly RiderView[],
  testHeldTool?: string,
): VehicleTickInput {
  return {
    tick,
    riders,
    testHeldTool,
    deckSeatInputs: [],
    velocity: { x: 0, y: 0, z: 0 },
    onGround: true,
    ...waterSensors(),
    blockTypes: () => [],
    solidAt: () => false,
    targets: () => [],
  };
}

function setup() {
  let state: string | undefined = "down";
  const drive: Drive = {
    speed: 0,
    yaw: 0,
    resync() {},
    onDriverMounted() {},
    onSeatVacated: () => [],
    toolState: (item) => (item === "switch" ? state : undefined),
    step: (_raw, sensors) => {
      expect(sensors).not.toHaveProperty("testHeldTool");
      return {
        impulse: { x: 0, y: 0, z: 0 },
        forward: { x: 0, z: 1 },
        commands: [driveCommand],
        riders: { thirdPerson: false, underwater: false },
      };
    },
  };
  const vehicle = new Vehicle(asVehicleId("v"), profile, drive);
  let tick = 0;
  return {
    vehicle,
    state: (value: string | undefined) => {
      state = value;
    },
    tick: (riders: readonly RiderView[] = [], testHeldTool?: string) =>
      vehicle.tick(tickInput(tick++, riders, testHeldTool)).stepCommands,
  };
}
function expectedScreen(
  held: string | undefined,
  state: string | undefined,
): number {
  if (held !== "switch") return 0;
  if (state === "down") return 1;
  if (state === "up") return 2;
  return 0;
}

const command = (value: number): EngineCommand => ({
  type: "setProperty",
  name: MONITOR_PROPERTY_NAME,
  value,
});

describe("vehicle cab monitor", () => {
  it("sends on the first tick, changes and resync, after the drive commands", () => {
    const sim = setup();
    const driver = [rider(0, "switch")];
    expect(sim.tick(driver)).toEqual([driveCommand, command(1)]);
    expect(sim.tick(driver)).toEqual([driveCommand]);
    sim.state("up");
    expect(sim.tick(driver)).toEqual([driveCommand, command(2)]);
    sim.vehicle.resync();
    expect(sim.tick(driver)).toEqual([driveCommand, command(2)]);
  });

  it("uses only the Crew driver even when the passenger comes first", () => {
    const sim = setup();
    expect(sim.tick([rider(1, "switch"), rider(0)])).toEqual([
      driveCommand,
      command(0),
    ]);
    expect(sim.tick([rider(1), rider(0, "switch")])).toEqual([
      driveCommand,
      command(1),
    ]);
    expect(sim.tick([rider(1, "switch")])).toEqual([driveCommand, command(0)]);
  });

  it("blanks without a driver and applies testHeldTool only without a driver", () => {
    const sim = setup();
    expect(sim.tick()).toEqual([driveCommand, command(0)]);
    expect(sim.tick([], "switch")).toEqual([driveCommand, command(1)]);
    expect(sim.tick([rider(0)], "switch")).toEqual([driveCommand, command(0)]);
    expect(sim.tick([rider(0, "switch")], "other")).toEqual([
      driveCommand,
      command(1),
    ]);
  });

  it("emits exactly when the screen differs from the last value sent", () => {
    const optional = (values: readonly string[]) =>
      fc.option(fc.oneof(fc.constantFrom(...values), fc.string()), {
        nil: undefined,
      });
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            held: optional(["switch"]),
            state: optional(["down", "up"]),
          }),
          { minLength: 1, maxLength: 100 },
        ),
        (ticks) => {
          const sim = setup();
          let last: number | undefined;
          for (const { held, state } of ticks) {
            sim.state(state);
            const expected = expectedScreen(held, state);
            expect(sim.tick([rider(0, held)])).toEqual(
              expected === last
                ? [driveCommand]
                : [driveCommand, command(expected)],
            );
            last = expected;
          }
        },
      ),
    );
  });
});

describe("bulldozer cab monitor", () => {
  function bulldozer() {
    const vehicle = createVehicle("bulldozer", asVehicleId("b"), 0);
    const seat = defined(profileOf("bulldozer").seats.positions[0], "seat");
    let tick = 0;
    const driver = (heldTool?: string): RiderView => ({
      id: asPlayerId("d"),
      offset: { x: seat.x, z: -seat.z },
      yaw: 0,
      raw: { moveX: 0, moveY: 0, jump: false },
      slot: 0,
      heldTool,
    });
    return {
      vehicle,
      monitor: (heldTool?: string) =>
        vehicle
          .tick(tickInput(tick++, [driver(heldTool)]))
          .stepCommands.filter(
            (c) => c.type === "setProperty" && c.name === MONITOR_PROPERTY_NAME,
          ),
    };
  }

  it("shows the blade switch's target and switches at once", () => {
    const sim = bulldozer();
    expect(sim.monitor(BLADE_SWITCH_ITEM)).toEqual([command(2)]);
    expect(sim.vehicle.switchBlade(asPlayerId("d"), 100)).toBe(true);
    expect(sim.monitor(BLADE_SWITCH_ITEM)).toEqual([command(1)]);
  });

  it("blanks for a driver holding nothing", () => {
    expect(bulldozer().monitor()).toEqual([command(0)]);
  });
});
