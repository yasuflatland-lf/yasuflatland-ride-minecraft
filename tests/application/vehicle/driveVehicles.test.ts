import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { DriveVehicles } from "../../../src/application/vehicle/driveVehicles";
import { SetDecor } from "../../../src/application/vehicle/setDecor";
import {
  asPlayerId,
  asVehicleId,
  type VehicleId,
} from "../../../src/domain/shared/ids";
import { forward } from "../../../src/domain/shared/vec";
import type { Drive, DriveStep } from "../../../src/domain/vehicle/drive";
import type { RawInput } from "../../../src/domain/vehicle/driveInput";
import { MONITOR_PROPERTY_NAME } from "../../../src/domain/vehicle/entityContract";
import { VEHICLE_KINDS } from "../../../src/domain/vehicle/kind";
import {
  createVehicle,
  entityContractOf,
  profileOf,
  rebuildVehicle,
} from "../../../src/domain/vehicle/kinds/index";
import { SUV_PROFILE } from "../../../src/domain/vehicle/kinds/suv/profile";
import { SUV_SPEC } from "../../../src/domain/vehicle/kinds/suv/spec";
import { headlightCells } from "../../../src/domain/vehicle/lighting/headlights";
import { SPEC } from "../../../src/domain/vehicle/spec";
import { type SeatExit, Vehicle } from "../../../src/domain/vehicle/vehicle";
import { defined } from "../../support/defined";
import {
  riderViews,
  type TickSample,
  tickSamples,
} from "../../support/vehicleFuzz";
import { FakeWorld, InMemoryRepo, snapshot } from "./fakes";

const logger = () => {
  const lines: string[] = [];
  return { lines, warn: (m: string) => lines.push(m) };
};

const FULL_THROTTLE: RawInput = { moveX: 0, moveY: 1, jump: false };

// Accelerates vehicle "a" (heading +z) toward a target 1 block ahead, feeding
// back the velocity the engine would report, until the speed passes the ram
// threshold, then returns the damage calls the world received.
function ramAhead(over: Parameters<typeof snapshot>[1]): string[] {
  const world = new FakeWorld();
  const repo = new InMemoryRepo();
  const uc = new DriveVehicles(world, repo, logger());
  world.targets = [{ id: "cow", offset: { x: 0, y: 0, z: 1 } }];
  for (let tick = 0; tick < 200; tick++) {
    const speed = repo.get(asVehicleId("a"))?.speed ?? 0;
    world.snapshots = [
      snapshot("a", { ...over, velocity: { x: 0, y: 0, z: speed } }),
    ];
    uc.execute(tick);
  }
  return world.calls.filter((c) => c.startsWith("damage:"));
}

describe("DriveVehicles", () => {
  it("protects sports boat riders and occupied deck seats from fire each tick", () => {
    const world = new FakeWorld();
    const uc = new DriveVehicles(world, new InMemoryRepo(), logger());
    world.snapshots = [
      snapshot("boat", {
        kind: "sportsboat",
        riders: [
          {
            id: asPlayerId("driver"),
            slot: 0,
            offset: { x: -0.38, z: 0.35 },
            yaw: 0,
            raw: FULL_THROTTLE,
          },
          {
            id: asPlayerId("passenger"),
            slot: 1,
            offset: { x: 0.38, z: 0.35 },
            yaw: 0,
            raw: FULL_THROTTLE,
          },
        ],
        deckSeatRiders: [undefined, undefined, asPlayerId("deck")],
      }),
    ];
    uc.execute(0);
    uc.execute(1);
    expect(world.calls.filter((call) => call.startsWith("fire:"))).toEqual([
      "fire:driver",
      "fire:passenger",
      "fire:deck",
      "fire:driver",
      "fire:passenger",
      "fire:deck",
    ]);
    world.snapshots = [];
    uc.execute(2);
    expect(world.calls.filter((call) => call.startsWith("fire:"))).toHaveLength(
      6,
    );
  });
  it("holds a vehicle and lays its requested floor instead of applying motion", () => {
    fc.assert(
      fc.property(
        fc.record({
          x: fc.integer(),
          y: fc.integer({ min: -64, max: 300 }),
          z: fc.integer(),
          yaw: fc.integer({ min: -180, max: 180 }),
        }),
        fc.array(
          fc.record({
            x: fc.integer(),
            y: fc.integer(),
            z: fc.integer(),
            block: fc.record({
              type: fc.constant("deck" as const),
              height: fc.integer({ min: 1, max: 16 }),
            }),
          }),
        ),
        (hold, floor) => {
          const step: DriveStep = {
            dock: { hold, cells: floor, seats: [] },
            impulse: { x: 0, y: 0, z: 1 },
            forward: { x: 0, z: 1 },
            commands: [],
            riders: { thirdPerson: false, underwater: false },
          };
          const drive: Drive = {
            speed: 0,
            yaw: hold.yaw,
            resync: () => {},
            onDriverMounted: () => {},
            onSeatVacated: () => [],
            step: () => step,
          };
          const world = new FakeWorld();
          const repo = new InMemoryRepo();
          repo.save(new Vehicle(asVehicleId("held"), SUV_PROFILE, drive));
          world.snapshots = [snapshot("held")];
          new DriveVehicles(world, repo, logger()).execute(0);
          expect(world.held.get("held")).toEqual(hold);
          expect(world.docks.get("held")).toEqual(floor);
          expect(world.calls.some((c) => c.startsWith("motion:held:"))).toBe(
            false,
          );
        },
      ),
    );
  });

  it("releases the hold and clears the floor when the drive does not request them", () => {
    const world = new FakeWorld();
    world.snapshots = [snapshot("a")];
    const holdAt = vi.spyOn(world, "holdAt");
    const layDock = vi.spyOn(world, "layDock");
    new DriveVehicles(world, new InMemoryRepo(), logger()).execute(0);
    expect(holdAt).toHaveBeenCalledWith("a", undefined);
    expect(layDock).toHaveBeenCalledWith("a", []);
    expect(world.calls).toContain("motion:a:0");
  });

  it("releases each vehicle that is no longer loaded once, and logs a failed release without skipping the others", () => {
    const world = new FakeWorld();
    const repo = new InMemoryRepo();
    const log = logger();
    repo.save(createVehicle("suv", asVehicleId("stuck"), 0));
    repo.save(createVehicle("suv", asVehicleId("gone"), 0));
    world.snapshots = [snapshot("a")];
    world.failReleaseOn = "stuck";
    new DriveVehicles(world, repo, log).execute(0);
    expect(world.calls.filter((c) => c.startsWith("release:"))).toEqual([
      "release:gone",
    ]);
    expect(log.lines).toEqual(["stuck: Error: release"]);
    expect(repo.ids()).toEqual(["a"]);
  });

  it("forwards ram hits to the world with the driver as the attacker", () => {
    const driver = {
      id: asPlayerId("d"),
      offset: { x: -0.38, z: 0.2 },
      yaw: 0,
      raw: FULL_THROTTLE,
    };
    const damage = ramAhead({ riders: [driver] });
    expect(damage.length).toBeGreaterThan(0);
    expect(damage.every((c) => c === "damage:cow:d")).toBe(true);
  });

  it("forwards ram hits without an attacker when test input drives the vehicle", () => {
    const damage = ramAhead({ testInput: FULL_THROTTLE });
    expect(damage.length).toBeGreaterThan(0);
    expect(damage.every((c) => c === "damage:cow:-")).toBe(true);
  });

  it("creates an aggregate for each loaded vehicle and applies its motion", () => {
    const world = new FakeWorld();
    const repo = new InMemoryRepo();
    world.snapshots = [snapshot("a", { yaw: 30 }), snapshot("b")];
    new DriveVehicles(world, repo, logger()).execute(0);
    expect(repo.ids().sort()).toEqual(["a", "b"]);
    expect(world.calls).toContain("motion:a:30");
  });

  it("keeps the entity's heading when it rebuilds a driven vehicle after a reload", () => {
    const world = new FakeWorld();
    const repo = new InMemoryRepo();
    const driver = {
      id: asPlayerId("d"),
      offset: { x: -0.38, z: 0.2 },
      yaw: 75,
      raw: { moveX: 0, moveY: 0, jump: false },
    };
    world.snapshots = [snapshot("a", { yaw: 10, riders: [driver] })];
    new DriveVehicles(world, repo, logger()).execute(0);
    expect(repo.get(asVehicleId("a"))?.yaw).toBeCloseTo(10);
    expect(world.calls).toContain("motion:a:10");
  });

  it("does not throw for a moving vehicle missing from the repository (after a reload) and rebuilds it from zero speed", () => {
    const world = new FakeWorld();
    const repo = new InMemoryRepo();
    world.snapshots = [snapshot("a", { velocity: { x: 0, y: 0, z: 0.5 } })];
    expect(() =>
      new DriveVehicles(world, repo, logger()).execute(0),
    ).not.toThrow();
    expect(repo.get(asVehicleId("a"))?.speed).toBeLessThanOrEqual(0.0225);
  });

  it("discards the aggregates of vehicles that are no longer loaded", () => {
    const world = new FakeWorld();
    const repo = new InMemoryRepo();
    repo.save(createVehicle("suv", asVehicleId("gone"), 0));
    world.snapshots = [snapshot("a")];
    new DriveVehicles(world, repo, logger()).execute(0);
    expect(repo.ids()).toEqual(["a"]);
    expect(world.calls.filter((c) => c.startsWith("release:"))).toEqual([
      "release:gone",
    ]);
  });

  it("keeps moving the other vehicles and logs the error when one vehicle throws", () => {
    const world = new FakeWorld();
    const log = logger();
    world.snapshots = [snapshot("bad"), snapshot("good")];
    world.failOn = "bad";
    new DriveVehicles(world, new InMemoryRepo(), log).execute(0);
    expect(world.calls).toContain("motion:good:0");
    expect(log.lines.some((l) => l.includes("bad"))).toBe(true);
  });

  it.each(["bank", "gear_down"])(
    "skips the rest of a vehicle's tick when its %s command throws, while other vehicles continue (ADR 0055)",
    (name) => {
      const world = new FakeWorld();
      const repo = new InMemoryRepo();
      const log = logger();
      const driver = {
        id: asPlayerId("driver"),
        offset: defined(SUV_PROFILE.seats.positions[0], "driver seat"),
        yaw: 0,
        raw: FULL_THROTTLE,
      };
      const passenger = {
        ...driver,
        id: asPlayerId("passenger"),
        offset: defined(SUV_PROFILE.seats.positions[1], "passenger seat"),
      };
      repo.save(
        rebuildVehicle("suv", asVehicleId("bad"), 0, [driver, passenger], {
          form: "submarine",
        }),
      );
      world.snapshots = [
        snapshot("bad", {
          waterDepth: SUV_SPEC.carHeight,
          riders: [driver],
          headlights: true,
        }),
        snapshot("good", {
          waterDepth: SUV_SPEC.carHeight,
          riders: [{ ...driver, id: asPlayerId("other") }],
          headlights: true,
        }),
      ];
      world.failRunOn = { id: "bad", name };
      const run = vi.spyOn(world, "run");
      new DriveVehicles(world, repo, log).execute(0);
      expect(run.mock.calls.filter(([id]) => id === "bad")).toHaveLength(1);
      expect(
        world.calls.some(
          (c) =>
            c.startsWith("motion:bad:") ||
            c.startsWith("door:bad:") ||
            c.startsWith("camera:driver:") ||
            c.startsWith("breathing:driver:"),
        ),
      ).toBe(false);
      expect(world.shone.has("bad")).toBe(false);
      expect(log.lines).toEqual([`bad: Error: command ${name}`]);
      expect(world.calls).toContain("motion:good:0");
      expect(world.calls).toContain("camera:other:mid");
      expect(world.calls).toContain(
        `breathing:other:${SPEC.waterBreathingTicks}`,
      );
      expect(world.shone.get("good")?.length).toBeGreaterThan(0);
    },
  );

  it("plays that seat's door sound when the driver's seat becomes empty", () => {
    const world = new FakeWorld();
    const repo = new InMemoryRepo();
    const uc = new DriveVehicles(world, repo, logger());
    const driver = {
      id: asPlayerId("d"),
      offset: { x: -0.38, z: 0.2 },
      yaw: 0,
      raw: { moveX: 0, moveY: 0, jump: false },
    };
    world.snapshots = [snapshot("a", { riders: [driver] })];
    uc.execute(0);
    world.snapshots = [snapshot("a")];
    uc.execute(1);
    expect(world.calls).toContain("door:a:door_fr");
  });

  it("rebuilds a vehicle lost in a reload in the vehicle form stored on the entity (ADR 0021)", () => {
    const world = new FakeWorld();
    const repo = new InMemoryRepo();
    world.snapshots = [
      snapshot("a", {
        restored: () => ({ form: "hover" }),
        onGround: false,
        testInput: FULL_THROTTLE,
      }),
    ];
    new DriveVehicles(world, repo, logger()).execute(0);
    expect(world.formOf("a")).toBe("hover");
    // A drive rebuilt in car form would send its gear down on the first tick.
    expect(world.calls).toContain("gear:a:up");
    expect(world.calls.some((c) => c.startsWith("form:"))).toBe(false);
  });

  it("writes the vehicle form to the world only on the tick it changes (ADR 0021)", () => {
    const world = new FakeWorld();
    const uc = new DriveVehicles(world, new InMemoryRepo(), logger());
    const idle = { moveX: 0, moveY: 0, jump: false };
    const pressed = { ...idle, jump: true };
    [pressed, idle, pressed, idle, idle].forEach((input, tick) => {
      world.snapshots = [snapshot("a", { testInput: input })];
      uc.execute(tick);
    });
    expect(world.calls.filter((c) => c.startsWith("form:"))).toEqual([
      "form:a:takeoff",
    ]);
  });

  it("writes the bank angle on the first tick and then only when it changes (ADR 0026)", () => {
    const world = new FakeWorld();
    const uc = new DriveVehicles(world, new InMemoryRepo(), logger());
    for (let tick = 0; tick < 3; tick++) {
      world.snapshots = [snapshot("a", { testInput: FULL_THROTTLE })];
      uc.execute(tick);
    }
    expect(world.calls.filter((c) => c.startsWith("bank:"))).toEqual([
      "bank:a:0",
    ]);
  });

  it("writes the landing gear on the first tick and then only when it changes (ADR 0033)", () => {
    const world = new FakeWorld();
    const uc = new DriveVehicles(world, new InMemoryRepo(), logger());
    const idle = { moveX: 0, moveY: 0, jump: false };
    const pressed = { ...idle, jump: true };
    [idle, idle, pressed, idle, pressed, idle].forEach((input, tick) => {
      world.snapshots = [snapshot("a", { testInput: input })];
      uc.execute(tick);
    });
    expect(world.calls.filter((c) => c.startsWith("gear:"))).toEqual([
      "gear:a:down",
      "gear:a:up",
    ]);
  });

  it("still writes a vehicle form change when moving the vehicle throws on that tick", () => {
    const world = new FakeWorld();
    const uc = new DriveVehicles(world, new InMemoryRepo(), logger());
    const idle = { moveX: 0, moveY: 0, jump: false };
    const pressed = { ...idle, jump: true };
    world.failOn = "a";
    [pressed, idle, pressed].forEach((input, tick) => {
      world.snapshots = [snapshot("a", { testInput: input })];
      uc.execute(tick);
    });
    expect(world.calls).toContain("form:a:takeoff");
  });

  it("still writes the bank angle when moving the vehicle throws on that tick (ADR 0026)", () => {
    const world = new FakeWorld();
    const uc = new DriveVehicles(world, new InMemoryRepo(), logger());
    world.failOn = "a";
    world.snapshots = [snapshot("a", { testInput: FULL_THROTTLE })];
    uc.execute(0);
    expect(world.calls).toContain("bank:a:0");
  });

  it("writes the bank of a turn in flight as it builds, and nothing more once it holds (ADR 0026)", () => {
    const world = new FakeWorld();
    const repo = new InMemoryRepo();
    const uc = new DriveVehicles(world, repo, logger());
    const right: RawInput = { moveX: -1, moveY: 1, jump: false };
    const bankCalls = () => world.calls.filter((c) => c.startsWith("bank:"));
    const fly = (ticks: number) => {
      for (let i = 0; i < ticks; i++) {
        // Feed back the velocity the engine would report for the heading and speed.
        const v = repo.get(asVehicleId("a"));
        const f = forward(v?.yaw ?? 0);
        const speed = (v?.speed ?? 0) * SUV_SPEC.flightDrag;
        world.snapshots = [
          snapshot("a", {
            restored: () => ({ form: "hover" }),
            onGround: false,
            yaw: v?.yaw ?? 0,
            velocity: { x: f.x * speed, y: 0, z: f.z * speed },
            testInput: right,
          }),
        ];
        uc.execute(i);
      }
    };
    fly(60);
    const angle = world.properties.get("a")?.bank;
    expect(angle).toBe(SUV_SPEC.maxBank);
    expect(bankCalls().at(-1)).toBe(`bank:a:${angle}`);
    const before = bankCalls().length;
    fly(20);
    expect(bankCalls()).toHaveLength(before);
  });

  it("lights the cells ahead of a vehicle with its headlights on, and none for one with them off", () => {
    const world = new FakeWorld();
    const location = { x: 10.5, y: 64, z: -3.2 };
    world.snapshots = [
      snapshot("on", { location, yaw: 30, headlights: true }),
      snapshot("off", { location, yaw: 30 }),
    ];
    new DriveVehicles(world, new InMemoryRepo(), logger()).execute(0);
    expect(world.shone.get("on")).toEqual(
      headlightCells(location, 30, SUV_PROFILE.beams),
    );
    expect(world.shone.get("off")).toEqual([]);
  });
});

describe("DriveVehicles third-person camera in flight (ADR 0028)", () => {
  const rider = (id: string) => ({
    id: asPlayerId(id),
    offset: { x: -0.38, z: 0.2 },
    yaw: 0,
    raw: { moveX: 0, moveY: 0, jump: false },
  });
  const cameraCalls = (world: FakeWorld) =>
    world.calls.filter((c) => c.startsWith("camera:"));

  it("switches riders of a flying vehicle to third person once, and back when they get off", () => {
    const world = new FakeWorld();
    const uc = new DriveVehicles(world, new InMemoryRepo(), logger());
    const flying = {
      restored: () => ({ form: "hover" }) as const,
      onGround: false,
    };
    world.snapshots = [snapshot("a", { ...flying, riders: [rider("p")] })];
    uc.execute(0);
    uc.execute(1);
    world.snapshots = [snapshot("a", { ...flying, testInput: FULL_THROTTLE })];
    uc.execute(2);
    uc.execute(3);
    expect(cameraCalls(world)).toEqual(["camera:p:mid", "camera:p:own"]);
  });

  it("gives the view back when the vehicle lands", () => {
    const world = new FakeWorld();
    const repo = new InMemoryRepo();
    const uc = new DriveVehicles(world, repo, logger());
    const idle = { moveX: 0, moveY: 0, jump: false };
    const pressed = { ...idle, jump: true };
    const tapTwice = [pressed, idle, pressed, idle];
    let tick = 0;
    const drive = (input: RawInput, onGround: boolean) => {
      world.snapshots = [
        snapshot("a", {
          onGround,
          riders: [{ ...rider("p"), raw: input }],
        }),
      ];
      uc.execute(tick++);
    };
    for (const input of tapTwice) drive(input, true);
    expect(world.formOf("a")).toBe("takeoff");
    // Takeoff and landing count as off the ground (ADR 0028).
    expect(cameraCalls(world)).toEqual(["camera:p:mid"]);
    while (world.formOf("a") !== "hover") drive(idle, false);
    for (const input of tapTwice) drive(input, false);
    expect(world.formOf("a")).toBe("landing");
    expect(cameraCalls(world)).toEqual(["camera:p:mid"]);
    drive(idle, true);
    expect(world.formOf("a")).toBe("car");
    expect(cameraCalls(world)).toEqual(["camera:p:mid", "camera:p:own"]);
  });

  it("pulls the camera back for a flying camper, and the mid view for a flying SUV (ADR 0071, 0170)", () => {
    const world = new FakeWorld();
    const uc = new DriveVehicles(world, new InMemoryRepo(), logger());
    const flying = {
      restored: () => ({ form: "hover" }) as const,
      onGround: false,
    };
    world.snapshots = [
      snapshot("a", { ...flying, riders: [rider("p")] }),
      snapshot("b", { ...flying, kind: "camper", riders: [rider("q")] }),
    ];
    uc.execute(0);
    uc.execute(1);
    expect(cameraCalls(world)).toEqual(["camera:p:mid", "camera:q:far"]);
  });

  it("switches a rider to the new vehicle's camera when they change vehicles in flight", () => {
    const world = new FakeWorld();
    const uc = new DriveVehicles(world, new InMemoryRepo(), logger());
    const flying = {
      restored: () => ({ form: "hover" }) as const,
      onGround: false,
    };
    world.snapshots = [snapshot("a", { ...flying, riders: [rider("p")] })];
    uc.execute(0);
    world.snapshots = [
      snapshot("a", flying),
      snapshot("b", { ...flying, kind: "camper", riders: [rider("p")] }),
    ];
    uc.execute(1);
    uc.execute(2);
    expect(cameraCalls(world)).toEqual(["camera:p:mid", "camera:p:far"]);
  });

  it("leaves riders of a vehicle on the ground with their own view", () => {
    const world = new FakeWorld();
    const uc = new DriveVehicles(world, new InMemoryRepo(), logger());
    world.snapshots = [snapshot("a", { riders: [rider("p")] })];
    uc.execute(0);
    expect(cameraCalls(world)).toEqual([]);
  });

  it("logs a camera failure without stopping the vehicles, and retries on the next tick", () => {
    const world = new FakeWorld();
    const log = logger();
    const uc = new DriveVehicles(world, new InMemoryRepo(), log);
    world.failCameraOn = "p";
    world.snapshots = [
      snapshot("a", {
        restored: () => ({ form: "hover" }),
        onGround: false,
        riders: [rider("p")],
      }),
    ];
    uc.execute(0);
    expect(log.lines.some((l) => l.includes("camera p"))).toBe(true);
    expect(world.calls.some((c) => c.startsWith("motion:a"))).toBe(true);
    world.failCameraOn = undefined;
    uc.execute(1);
    expect(cameraCalls(world)).toEqual(["camera:p:mid"]);
  });

  it("logs a camera that keeps failing once, not every tick", () => {
    const world = new FakeWorld();
    const log = logger();
    const uc = new DriveVehicles(world, new InMemoryRepo(), log);
    world.failCameraOn = "p";
    world.snapshots = [
      snapshot("a", {
        restored: () => ({ form: "hover" }),
        onGround: false,
        riders: [rider("p")],
      }),
    ];
    for (let tick = 0; tick < 5; tick++) uc.execute(tick);
    expect(log.lines.filter((l) => l.includes("camera p"))).toHaveLength(1);
  });

  it("logs a camera failure again when it fails after a switch that worked", () => {
    const world = new FakeWorld();
    const log = logger();
    const uc = new DriveVehicles(world, new InMemoryRepo(), log);
    const flying = {
      restored: () => ({ form: "hover" }) as const,
      onGround: false,
    };
    const riding = [snapshot("a", { ...flying, riders: [rider("p")] })];
    world.snapshots = riding;
    world.failCameraOn = "p";
    uc.execute(0);
    world.failCameraOn = undefined;
    uc.execute(1);
    world.snapshots = [snapshot("a", flying)];
    uc.execute(2);
    world.snapshots = riding;
    world.failCameraOn = "p";
    uc.execute(3);
    expect(cameraCalls(world)).toEqual(["camera:p:mid", "camera:p:own"]);
    expect(log.lines.filter((l) => l.includes("camera p"))).toHaveLength(2);
  });

  it("retries giving the view back when it fails", () => {
    const world = new FakeWorld();
    const uc = new DriveVehicles(world, new InMemoryRepo(), logger());
    world.snapshots = [
      snapshot("a", {
        restored: () => ({ form: "hover" }),
        onGround: false,
        riders: [rider("p")],
      }),
    ];
    uc.execute(0);
    world.snapshots = [
      snapshot("a", { restored: () => ({ form: "hover" }), onGround: false }),
    ];
    world.failCameraOn = "p";
    uc.execute(1);
    world.failCameraOn = undefined;
    uc.execute(2);
    uc.execute(3);
    expect(cameraCalls(world)).toEqual(["camera:p:mid", "camera:p:own"]);
  });
});

describe("DriveVehicles submarine riders (ADR 0040)", () => {
  const rider = (id: string) => ({
    id: asPlayerId(id),
    offset: { x: -0.38, z: 0.2 },
    yaw: 0,
    raw: { moveX: 0, moveY: 0, jump: false },
  });
  const breathing = (id: string) =>
    `breathing:${id}:${SPEC.waterBreathingTicks}`;
  const breathingCalls = (world: FakeWorld) =>
    world.calls.filter((c) => c.startsWith("breathing:"));

  it("senses submersion and refreshes every rider's breathing only every second", () => {
    const world = new FakeWorld();
    const repo = new InMemoryRepo();
    const uc = new DriveVehicles(world, repo, logger());
    world.snapshots = [
      snapshot("a", {
        waterDepth: SUV_SPEC.carHeight,
        riders: [rider("driver"), rider("passenger")],
      }),
    ];
    uc.execute(0);
    expect(world.formOf("a")).toBe("submarine");
    expect(world.calls).toContain("form:a:submarine");
    expect(breathingCalls(world)).toEqual([
      breathing("driver"),
      breathing("passenger"),
    ]);
    for (let tick = 1; tick < SPEC.waterBreathingInterval; tick++)
      uc.execute(tick);
    expect(breathingCalls(world)).toHaveLength(2);
    uc.execute(SPEC.waterBreathingInterval);
    expect(breathingCalls(world)).toEqual([
      breathing("driver"),
      breathing("passenger"),
      breathing("driver"),
      breathing("passenger"),
    ]);
  });

  it("does not give breathing to car or hover riders", () => {
    const world = new FakeWorld();
    world.snapshots = [
      snapshot("car", { riders: [rider("c")] }),
      snapshot("hover", {
        restored: () => ({ form: "hover" }),
        onGround: false,
        riders: [rider("h")],
      }),
    ];
    new DriveVehicles(world, new InMemoryRepo(), logger()).execute(20);
    expect(breathingCalls(world)).toEqual([]);
  });

  it("logs a failed breathing call and still refreshes the other riders", () => {
    const world = new FakeWorld();
    const log = logger();
    world.failBreathingOn = "bad";
    world.snapshots = [
      snapshot("a", {
        waterDepth: SUV_SPEC.carHeight,
        riders: [rider("bad"), rider("good")],
      }),
      snapshot("b", {
        waterDepth: SUV_SPEC.carHeight,
        riders: [rider("other")],
      }),
    ];
    new DriveVehicles(world, new InMemoryRepo(), log).execute(20);
    expect(breathingCalls(world)).toEqual([
      breathing("good"),
      breathing("other"),
    ]);
    expect(log.lines.some((line) => line.includes("breathing bad"))).toBe(true);
  });

  it("switches submarine riders to third person and restores their view and stops breathing on shore", () => {
    const world = new FakeWorld();
    const uc = new DriveVehicles(world, new InMemoryRepo(), logger());
    world.snapshots = [
      snapshot("a", {
        restored: () => ({ form: "submarine" }),
        waterDepth: SUV_SPEC.carHeight,
        riders: [rider("p")],
      }),
    ];
    uc.execute(0);
    uc.execute(1);
    world.snapshots = [snapshot("a", { riders: [rider("p")] })];
    uc.execute(20);
    expect(world.calls.filter((c) => c.startsWith("camera:"))).toEqual([
      "camera:p:mid",
      "camera:p:own",
    ]);
    expect(world.calls).toContain("form:a:car");
    expect(breathingCalls(world)).toEqual([breathing("p")]);
  });

  it("stops refreshing breathing once a rider leaves", () => {
    const world = new FakeWorld();
    const uc = new DriveVehicles(world, new InMemoryRepo(), logger());
    world.snapshots = [
      snapshot("a", { waterDepth: SUV_SPEC.carHeight, riders: [rider("p")] }),
    ];
    uc.execute(0);
    world.snapshots = [snapshot("a", { waterDepth: SUV_SPEC.carHeight })];
    uc.execute(20);
    expect(breathingCalls(world)).toEqual([breathing("p")]);
    expect(world.calls).toContain("camera:p:own");
  });
});

it("drives a boat with water below high feet and leaves a dry boat still", () => {
  fc.assert(
    fc.property(fc.boolean(), (waterBelow) => {
      const world = new FakeWorld();
      const repo = new InMemoryRepo();
      const log = logger();
      world.snapshots = [
        snapshot("boat", {
          kind: "sportsboat",
          waterDepth: 0,
          waterBelow,
          onGround: false,
          testInput: FULL_THROTTLE,
        }),
      ];
      new DriveVehicles(world, repo, log).execute(0);
      const speed = repo.get(asVehicleId("boat"))?.speed;
      if (waterBelow) expect(speed).toBeGreaterThan(0);
      else expect(speed).toBe(0);
      expect(log.lines).toEqual([]);
    }),
  );
});

it("reads restored properties only when an aggregate is missing", () => {
  const world = new FakeWorld();
  const restored = vi.fn(() => ({ form: "hover" }));
  world.snapshots = [
    snapshot("a", {
      restored,
      onGround: false,
      testInput: { moveX: 0, moveY: 0, jump: false },
    }),
  ];
  const uc = new DriveVehicles(world, new InMemoryRepo(), { warn: vi.fn() });
  uc.execute(0);
  uc.execute(1);
  expect(restored).toHaveBeenCalledTimes(1);
});

it("passes deck input through and boards before keeping deck seats", () => {
  const world = new FakeWorld();
  world.snapshots = [
    snapshot("boat", {
      kind: "sportsboat",
      restored: () => ({ docked: true }),
      deckSeatInputs: [FULL_THROTTLE],
    }),
  ];
  const board = vi.spyOn(world, "boardDeckRiders");
  const keep = vi.spyOn(world, "keepDeckSeats");
  const log = logger();
  new DriveVehicles(world, new InMemoryRepo(), log).execute(0);
  expect(board).toHaveBeenCalledWith("boat");
  expect(keep).toHaveBeenCalledWith(
    "boat",
    expect.arrayContaining([
      expect.objectContaining({ y: world.snapshots[0]?.location.y }),
    ]),
    0,
  );
  expect(board.mock.invocationCallOrder[0]).toBeLessThan(
    defined(keep.mock.invocationCallOrder[0], "keep order"),
  );
  expect(log.lines).toEqual([]);
});

it("lays a boat's chosen seats, with the deck seat's rider in its seat, before the deck riders board, and never an SUV's (ADR 0120)", () => {
  const world = new FakeWorld();
  world.snapshots = [
    snapshot("boat", {
      kind: "sportsboat",
      restored: () => ({ docked: true }),
      deckSeatInputs: [FULL_THROTTLE, undefined, undefined],
      deckSeatRiders: [asPlayerId("driver"), undefined, asPlayerId("rear")],
    }),
    snapshot("suv"),
  ];
  new DriveVehicles(world, new InMemoryRepo(), logger()).execute(0);
  expect([...world.seatLayouts]).toEqual([
    ["boat", ["driver", undefined, "rear"]],
  ]);
  const order = world.calls.filter(
    (c) => c === "keepSeatLayout" || c === "boardDeckRiders",
  );
  expect(order).toEqual(["keepSeatLayout", "boardDeckRiders"]);
});

it("clears deck seats without boarding for ordinary motion", () => {
  const world = new FakeWorld();
  world.snapshots = [snapshot("a")];
  const board = vi.spyOn(world, "boardDeckRiders");
  const keep = vi.spyOn(world, "keepDeckSeats");
  new DriveVehicles(world, new InMemoryRepo(), logger()).execute(0);
  expect(board).not.toHaveBeenCalled();
  expect(keep).toHaveBeenCalledWith("a", [], 0);
});

describe("DriveVehicles dock ports", () => {
  function fixture(step: Partial<DriveStep>, driver = false, query = false) {
    const world = new FakeWorld();
    const repo = new InMemoryRepo();
    const at = { x: 8, y: 64, z: 9 };
    world.typesAt.set("8,64,9", "minecraft:stone");
    let types: readonly (string | undefined)[] = [];
    const drive: Drive = {
      speed: 0,
      yaw: 0,
      resync: () => {},
      onDriverMounted: () => {},
      onSeatVacated: () => [],
      step: (_raw, ctx) => {
        if (query) types = ctx.blockTypes([at, { ...at, y: 65 }]);
        return {
          impulse: { x: 0, y: 0, z: 0 },
          forward: { x: 0, z: 1 },
          commands: [],
          riders: { thirdPerson: false, underwater: false },
          ...step,
        };
      },
    };
    repo.save(new Vehicle(asVehicleId("a"), SUV_PROFILE, drive));
    world.snapshots = [
      snapshot("a", {
        riders: driver
          ? [
              {
                id: asPlayerId("driver"),
                offset: defined(SUV_PROFILE.seats.positions[0], "driver seat"),
                yaw: 0,
                raw: FULL_THROTTLE,
              },
            ]
          : [],
      }),
    ];
    const blockTypes = vi.spyOn(world, "blockTypes");
    new DriveVehicles(world, repo, logger()).execute(0);
    return { world, types, at, blockTypes };
  }

  it("cuts the step's columns after clearing blocks and before moving the vehicle (ADR 0137)", () => {
    const cut = [{ x: 9, z: 9, bottom: 64 }];
    const { world } = fixture({
      clear: [{ x: 8, y: 64, z: 9, typeId: "minecraft:stone" }],
      cut,
    });
    expect(world.cuts).toEqual([{ vehicleId: "a", columns: cut }]);
    expect(
      world.calls.filter((c) =>
        ["clearBlocks", "cutColumns", "motion:a:0"].includes(c),
      ),
    ).toEqual(["clearBlocks", "cutColumns", "motion:a:0"]);
  });
  it.each([undefined, []])(
    "makes no cut call when the step cuts nothing",
    (cut) => {
      expect(fixture({ cut }).world.cuts).toEqual([]);
    },
  );

  it("clears checked blocks before laying dock cells in the same tick", () => {
    const clear = [{ x: 8, y: 64, z: 9, typeId: "minecraft:short_grass" }];
    const { world } = fixture({
      clear,
      dock: {
        hold: { x: 0, y: 64, z: 0, yaw: 0 },
        cells: [{ x: 8, y: 64, z: 9, block: { type: "floor" } }],
        seats: [],
      },
    });
    expect(world.cleared).toEqual([{ vehicleId: "a", cells: clear }]);
    expect(
      world.calls.filter((c) => c === "clearBlocks" || c === "layDock"),
    ).toEqual(["clearBlocks", "layDock"]);
  });

  it.each([true, false])(
    "shows messages only when a driver exists: %s",
    (driver) => {
      const { world } = fixture({ message: "park_blocked" }, driver);
      expect(world.messages).toEqual(
        driver ? [{ playerId: "driver", name: "park_blocked" }] : [],
      );
    },
  );

  it("boards deck riders before seating standing players", () => {
    const depart = {
      boxes: [{ min: { x: 0, y: 64, z: 0 }, max: { x: 3, y: 67, z: 4 } }],
      exit: { x: 4, y: 64, z: 0, yaw: 90 },
    };
    const { world } = fixture({ boardDeckRiders: true, depart });
    expect(world.departures).toEqual([{ vehicleId: "a", departure: depart }]);
    expect(
      world.calls.filter(
        (c) => c === "boardDeckRiders" || c === "seatStandingPlayers",
      ),
    ).toEqual(["boardDeckRiders", "seatStandingPlayers"]);
  });

  it("forwards lazy block queries with the vehicle id and world cells", () => {
    const { types, at, blockTypes } = fixture({}, false, true);
    expect(types).toEqual(["minecraft:stone", "minecraft:air"]);
    expect(blockTypes).toHaveBeenCalledExactlyOnceWith("a", [
      at,
      { ...at, y: 65 },
    ]);
    expect(fixture({}).blockTypes).not.toHaveBeenCalled();
  });
});

describe("DriveVehicles stand-ins (ADR 0116)", () => {
  it("keeps a camper's bumper stand-in in front of it and none for the SUV and the boat", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -180, max: 180 }),
        fc.integer({ min: -100, max: 100 }),
        fc.integer({ min: -100, max: 100 }),
        (yaw, x, z) => {
          const world = new FakeWorld();
          const uc = new DriveVehicles(world, new InMemoryRepo(), logger());
          const location = { x: x + 0.5, y: 64, z: z + 0.5 };
          world.snapshots = [
            snapshot("c", { kind: "camper", yaw, location }),
            snapshot("s", { kind: "suv", yaw, location }),
            snapshot("b", { kind: "sportsboat", yaw, location }),
          ];
          uc.execute(0);
          const pose = defined(world.standIns.get("c"), "camper stand-in");
          const f = forward(yaw);
          expect(pose.name).toBe("camper_bumper");
          expect(
            Math.hypot(pose.x - location.x, pose.z - location.z),
          ).toBeCloseTo(3.7, 6);
          expect(pose.x - location.x).toBeCloseTo(f.x * 3.7, 6);
          expect(pose.z - location.z).toBeCloseTo(f.z * 3.7, 6);
          expect(world.standIns.has("s")).toBe(true);
          expect(world.standIns.get("s")).toBeUndefined();
          expect(world.standIns.get("b")).toBeUndefined();
        },
      ),
    );
  });
});

const retryTick = fc.record({
  input: fc.record({
    moveX: fc.integer({ min: -1, max: 1 }),
    moveY: fc.integer({ min: -1, max: 1 }),
    jump: fc.boolean(),
  }),
  failure: fc.option(
    fc.record({
      id: fc.constant("a"),
      name: fc.constantFrom(
        "form",
        "bank",
        "gear_down",
        "gravity_on",
        "gravity_off",
      ),
    }),
    { nil: undefined },
  ),
});

it("converges to the reference entity after every successful tick despite failed sends", () => {
  fc.assert(
    fc.property(
      fc.array(retryTick, { minLength: 60, maxLength: 100 }),
      (ticks) => {
        const reference = new FakeWorld();
        const failing = new FakeWorld();
        // The restored entity already has car form; its primed latch need not send it.
        reference.properties.set("a", { form: "car" });
        failing.properties.set("a", { form: "car" });
        const log = logger();
        const good = new DriveVehicles(reference, new InMemoryRepo(), logger());
        const retry = new DriveVehicles(failing, new InMemoryRepo(), log);
        let throws = 0;
        const forms = new Set<unknown>();
        ticks.forEach(({ input, failure }, tick) => {
          const snap = snapshot("a", {
            testInput: input,
            onGround: tick % 40 >= 30,
          });
          reference.snapshots = [snap];
          failing.snapshots = [snap];
          failing.failRunOn = failure;
          const before = log.lines.length;
          good.execute(tick);
          retry.execute(tick);
          forms.add(reference.properties.get("a")?.form);
          if (log.lines.length > before) throws++;
          else {
            for (const name of ["form", "bank", "gear_down"]) {
              expect(failing.properties.get("a")?.[name]).toEqual(
                reference.properties.get("a")?.[name],
              );
            }
          }
        });
        fc.pre(throws > 0 && forms.size > 1);
      },
    ),
  );
});

it("retries gravity_on after a failed landing send and logs the failure once", () => {
  const world = new FakeWorld();
  const repo = new InMemoryRepo();
  repo.save(rebuildVehicle("suv", asVehicleId("a"), 0, [], { form: "hover" }));
  const log = logger();
  const uc = new DriveVehicles(world, repo, log);
  const run = vi.spyOn(world, "run");
  world.snapshots = [
    snapshot("a", {
      testInput: { moveX: 0, moveY: 0, jump: false },
      onGround: true,
    }),
  ];
  world.failRunOn = { id: "a", name: "gravity_on" };
  uc.execute(0);
  expect(run.mock.calls[0]?.[1][0]).toEqual({
    type: "triggerEvent",
    name: "gravity_on",
  });
  world.failRunOn = undefined;
  run.mockClear();
  uc.execute(1);
  expect(run.mock.calls[0]?.[1][0]).toEqual({
    type: "triggerEvent",
    name: "gravity_on",
  });
  expect(log.lines).toEqual(["a: Error: command gravity_on"]);
});

it("resyncs after tick throws after building commands, preserving the thrown error", () => {
  const world = new FakeWorld();
  const repo = new InMemoryRepo();
  const vehicle = createVehicle("suv", asVehicleId("a"), 0);
  repo.save(vehicle);
  const tick = vehicle.tick.bind(vehicle);
  const error = new Error("after step");
  vi.spyOn(vehicle, "tick").mockImplementationOnce((input) => {
    tick(input);
    throw error;
  });
  const resync = vi.spyOn(vehicle, "resync");
  const log = logger();
  const uc = new DriveVehicles(world, repo, log);
  world.snapshots = [snapshot("a")];
  uc.execute(0);
  expect(resync).toHaveBeenCalledTimes(1);
  expect(log.lines).toEqual([`a: ${error}`]);
  uc.execute(1);
  expect(world.properties.get("a")).toEqual({
    form: "car",
    bank: 0,
    gear_down: true,
  });
});

it("does not resync when a later world call throws after step commands succeeded", () => {
  const world = new FakeWorld();
  const repo = new InMemoryRepo();
  const vehicle = createVehicle("suv", asVehicleId("a"), 0);
  repo.save(vehicle);
  const resync = vi.spyOn(vehicle, "resync");
  const run = vi.spyOn(world, "run");
  world.snapshots = [snapshot("a")];
  world.failOn = "a";
  const uc = new DriveVehicles(world, repo, logger());
  uc.execute(0);
  expect(resync).not.toHaveBeenCalled();
  world.failOn = undefined;
  run.mockClear();
  uc.execute(1);
  expect(run.mock.calls[0]?.[1]).toEqual([]);
});

describe("entity mirror (ADR 0055)", () => {
  const MAX_TICKS = 40;
  // A failed step send resyncs the vehicle, so the next failure-free tick resends every
  // value (ADR 0127). Final commands are not resent, but no kind puts a property in them.
  const RESYNC_TICKS = 1;
  const id: VehicleId = asVehicleId("v");
  // Each tick makes at most two run calls, the step commands and then the final commands.
  const faultPlan = fc.array(
    fc.oneof(
      { arbitrary: fc.constant(undefined), weight: 3 },
      { arbitrary: fc.integer({ min: 0, max: 5 }), weight: 1 },
    ),
    { minLength: 2 * MAX_TICKS, maxLength: 2 * MAX_TICKS },
  );

  it.each(VEHICLE_KINDS)(
    "keeps every entity property equal to the drive's last value once the world stops failing, for %s",
    (kind) => {
      const { properties } = entityContractOf(kind);
      // The core writes the monitor for a kind with a rule; no kind contract declares it (ADR 0139).
      const declared = [
        ...Object.keys(properties),
        ...(profileOf(kind).monitor ? [MONITOR_PROPERTY_NAME] : []),
      ];
      // A rebuilt drive trusts the form it reads back and does not send it
      // again (ADR 0039, 0127), so both entities start out holding it.
      // The icebreaker also trusts its restored bool; a fresh entity defaults to false.
      const entityAtStart: fc.Arbitrary<Record<string, string | boolean>> =
        properties.form?.type === "enum"
          ? fc.constantFrom(...properties.form.values).map((form) => ({ form }))
          : properties.icebreaker
            ? fc.boolean().map((icebreaker) => ({ icebreaker }))
            : fc.constant<Record<string, string | boolean>>({});
      fc.assert(
        fc.property(
          fc.double({ min: -180, max: 180, noNaN: true }),
          entityAtStart,
          tickSamples(kind, MAX_TICKS),
          faultPlan,
          (yaw, start, samples, plan) => {
            const reference = new FakeWorld();
            const faulty = new FakeWorld();
            reference.properties.set(id, { ...start });
            faulty.properties.set(id, { ...start });
            const referenceRepo = new InMemoryRepo();
            const good = new DriveVehicles(reference, referenceRepo, logger());
            const failing = new DriveVehicles(
              faulty,
              new InMemoryRepo(),
              logger(),
            );
            // Both drives get the same snapshots and a failed send changes no vehicle
            // state (ADR 0127), so the reference heading is the faulty drive's too.
            const expectMirrored = () =>
              expect(faulty.properties.get(id)).toEqual(
                reference.properties.get(id),
              );
            const tickBoth = (s: TickSample, tick: number) => {
              const heading = referenceRepo.get(id)?.yaw ?? yaw;
              const snap = snapshot(id, {
                kind,
                yaw: heading,
                riders: riderViews(kind, s.riders, heading),
                testInput: s.testInput,
                deckSeatInputs: [...s.deckSeatInputs],
                velocity: s.velocity,
                onGround: s.onGround,
                waterDepth: s.depth,
                waterBelow: s.below,
                restored: () => start,
              });
              reference.snapshots = [snap];
              faulty.snapshots = [snap];
              good.execute(tick);
              failing.execute(tick);
            };
            let faulted = false;
            faulty.runFault = (_id, call) => {
              const fault = plan[call];
              if (fault !== undefined) faulted = true;
              return fault;
            };
            samples.forEach((s, tick) => {
              faulted = false;
              tickBoth(s, tick);
              if (!faulted) expectMirrored();
            });
            faulty.runFault = undefined;
            const last = defined(samples.at(-1), "last sample");
            for (let extra = 0; extra < RESYNC_TICKS; extra++)
              tickBoth(last, samples.length + extra);

            expectMirrored();
            for (const world of [reference, faulty])
              for (const name of Object.keys(world.properties.get(id) ?? {}))
                expect(declared).toContain(name);
          },
        ),
        { numRuns: 200 },
      );
    },
  );
});

it("a failed cut skips the rest of that vehicle's tick but not the other vehicles' (ADR 0055, 0137)", () => {
  const world = new FakeWorld();
  const repo = new InMemoryRepo();
  const cut = [{ x: 9, z: 9, bottom: 64 }];
  for (const id of ["a", "b"])
    repo.save(
      new Vehicle(asVehicleId(id), SUV_PROFILE, {
        speed: 0,
        yaw: 0,
        resync() {},
        onDriverMounted() {},
        onSeatVacated: () => [],
        step: () => ({
          cut,
          impulse: { x: 0, y: 0, z: 0 },
          forward: { x: 0, z: 1 },
          commands: [],
          riders: { thirdPerson: false, underwater: false },
        }),
      }),
    );
  world.snapshots = [snapshot("a"), snapshot("b")];
  world.failCutOn = "a";
  new DriveVehicles(world, repo, logger()).execute(0);
  expect(world.calls).toContain("motion:b:0");
  expect(world.calls).not.toContain("motion:a:0");
  expect(world.cuts).toEqual([{ vehicleId: "b", columns: cut }]);
});

it("stands each leaving rider at their exit after the final commands", () => {
  const world = new FakeWorld();
  const repo = new InMemoryRepo();
  const vehicle = createVehicle("suv", asVehicleId("car"), 0);
  repo.save(vehicle);
  world.snapshots = [snapshot("car")];
  const outcome = vehicle.tick({
    ...snapshot("car"),
    tick: 0,
    waterAt: () => false,
    solidAt: () => false,
    blockTypes: () => [],
    targets: () => [],
  });
  const exits: readonly SeatExit[] = [
    { playerId: asPlayerId("a"), at: { x: 1, y: 64, z: 2 } },
    { playerId: asPlayerId("b"), at: { x: -1, y: 64, z: 2 } },
  ];
  vi.spyOn(vehicle, "tick").mockReturnValue({ ...outcome, exits });
  const run = vi.spyOn(world, "run");
  const stand = vi.spyOn(world, "standRiderAt");
  new DriveVehicles(world, repo, logger()).execute(1);
  expect(stand.mock.calls).toEqual(
    exits.map((exit) => [vehicle.id, exit.playerId, exit.at]),
  );
  expect(run).toHaveBeenLastCalledWith(vehicle.id, outcome.finalCommands);
  expect(stand.mock.invocationCallOrder[0]).toBeGreaterThan(
    defined(run.mock.invocationCallOrder.at(-1), "final run"),
  );
});

it("silently drops saved oil lamps and removed decor, and saves it after the next change", () => {
  const world = new FakeWorld();
  const repo = new InMemoryRepo();
  const log = logger();
  world.snapshots = [
    snapshot("car", {
      kind: "camper",
      restored: () => ({
        dockDecor: JSON.stringify([
          { slot: "stove", item: "lava_lamp" },
          { slot: "table", item: "oil_lamp" },
        ]),
      }),
    }),
  ];
  expect(() => new DriveVehicles(world, repo, log).execute(0)).not.toThrow();
  const vehicleId = asVehicleId("car");
  expect(repo.get(vehicleId)?.decor()).toEqual([]);
  expect(log.lines).toEqual([]);
  const saveDecor = vi.fn();
  expect(
    new SetDecor({ saveDecor }, repo).execute({
      vehicleId,
      slot: "stove",
      item: "toaster",
    }),
  ).toBe(true);
  expect(saveDecor).toHaveBeenCalledWith(vehicleId, [
    { slot: "stove", item: "toaster" },
  ]);
});
