import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { DriveVehicles } from "../../../src/application/vehicle/driveVehicles";
import { SetDecor } from "../../../src/application/vehicle/room/setDecor";
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
  CAMPER_ROOM,
  CAMPER_SAVED,
  createVehicle,
  entityContractOf,
  profileOf,
  rebuildVehicle,
} from "../../../src/domain/vehicle/kinds/index";
import { SuvDrive } from "../../../src/domain/vehicle/kinds/suv/drive";
import { SUV_PROFILE } from "../../../src/domain/vehicle/kinds/suv/profile";
import { SUV_SPEC } from "../../../src/domain/vehicle/kinds/suv/spec";
import { headlightCells } from "../../../src/domain/vehicle/lighting/headlights";
import { SPEC } from "../../../src/domain/vehicle/spec";
import { type SeatExit, Vehicle } from "../../../src/domain/vehicle/vehicle";
import { decorItemId, decorSlotId } from "../../support/decorIds";
import { defined } from "../../support/defined";
import { engineStep } from "../../support/engineModel";
import { riderView } from "../../support/riders";
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

function driveReturning(
  next: (...args: Parameters<Drive["step"]>) => Partial<DriveStep>,
): Drive {
  return {
    speed: 0,
    yaw: 0,
    resync: () => {},
    onDriverMounted: () => {},
    onSeatVacated: () => [],
    step: (raw, context) => ({
      impulse: { x: 0, y: 0, z: 0 },
      forward: { x: 0, z: 1 },
      commands: [],
      riders: { thirdPerson: false, underwater: false },
      ...next(raw, context),
    }),
  };
}

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
          riderView("driver", {
            slot: 0,
            offset: { x: -0.38, z: 0.35 },
            raw: FULL_THROTTLE,
          }),
          riderView("passenger", {
            slot: 1,
            offset: { x: 0.38, z: 0.35 },
            raw: FULL_THROTTLE,
          }),
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

  it("sweeps once after every snapshot tick, including one that failed, and before releasing gone vehicles", () => {
    const world = new FakeWorld();
    const repo = new InMemoryRepo();
    const log = logger();
    const tick = vi.spyOn(world, "keepDeckSeats");
    tick.mockImplementationOnce(() => {
      throw new Error("tick");
    });
    const sweep = vi.spyOn(world, "sweepGone");
    sweep.mockImplementationOnce(() => {
      throw new Error("sweep");
    });
    const release = vi.spyOn(world, "releaseVehicle");
    const ids = [asVehicleId("a"), asVehicleId("b")];
    world.snapshots = ids.map((id) => snapshot(id));
    repo.save(createVehicle("suv", asVehicleId("gone"), 0));
    const drive = new DriveVehicles(world, repo, log);

    drive.execute(0);
    expect(tick.mock.calls.map(([id]) => id)).toEqual(ids);
    expect(sweep).toHaveBeenCalledExactlyOnceWith(new Set(ids));
    expect(sweep.mock.invocationCallOrder[0]).toBeGreaterThan(
      tick.mock.invocationCallOrder[1] ?? 0,
    );
    expect(release).toHaveBeenCalledExactlyOnceWith("gone");
    expect(release.mock.invocationCallOrder[0]).toBeGreaterThan(
      sweep.mock.invocationCallOrder[0] ?? 0,
    );
    expect(log.lines).toEqual([
      "a: Error: tick",
      "sweep gone vehicles: Error: sweep",
    ]);

    world.snapshots = [];
    drive.execute(1);
    expect(sweep.mock.calls).toEqual([[new Set(ids)], [new Set()]]);
  });

  it("cancels a pending release when the vehicle is loaded again and resets its warning", () => {
    const world = new FakeWorld();
    const repo = new InMemoryRepo();
    const log = logger();
    const id = asVehicleId("returning");
    repo.save(createVehicle("suv", id, 0));
    world.failReleaseOn = id;
    const release = vi.spyOn(world, "releaseVehicle");
    const uc = new DriveVehicles(world, repo, log);

    uc.execute(0);
    world.snapshots = [snapshot(id)];
    world.failReleaseOn = undefined;
    uc.execute(1);
    uc.execute(2);
    expect(release.mock.calls).toEqual([[id]]);
    expect(world.calls).not.toContain("release:returning");
    expect(repo.ids()).toEqual([id]);

    world.snapshots = [];
    world.failReleaseOn = id;
    uc.execute(3);
    expect(release.mock.calls).toEqual([[id], [id]]);
    expect(log.lines).toEqual([
      "returning: Error: release",
      "returning: Error: release",
    ]);
  });

  it("retries gone vehicles independently and warns once per failed release cycle", () => {
    const maxFailures = 5;
    fc.assert(
      fc.property(
        fc.uniqueArray(
          fc.record({
            id: fc
              .string({ minLength: 1, maxLength: 12 })
              .map((id) => `gone-${id}`),
            failures: fc.integer({ min: 0, max: maxFailures }),
          }),
          { selector: ({ id }) => id, minLength: 2, maxLength: 8 },
        ),
        (vehicles) => {
          const world = new FakeWorld();
          const repo = new InMemoryRepo();
          const attempts = new Map<string, number>();
          const log = logger();
          world.snapshots = [snapshot("loaded")];
          for (const { id } of vehicles)
            repo.save(createVehicle("suv", asVehicleId(id), 0));
          const release = world.releaseVehicle.bind(world);
          const releaseSpy = vi
            .spyOn(world, "releaseVehicle")
            .mockImplementation((id) => {
              const attempt = (attempts.get(id) ?? 0) + 1;
              attempts.set(id, attempt);
              const failures = defined(
                vehicles.find((vehicle) => vehicle.id === id),
                "gone vehicle",
              ).failures;
              world.failReleaseOn = attempt <= failures ? id : undefined;
              release(id);
            });
          const uc = new DriveVehicles(world, repo, log);
          const warnings = vehicles
            .filter(({ failures }) => failures > 0)
            .map(({ id }) => `${id}: Error: release`)
            .sort();

          for (let tick = 0; tick <= maxFailures; tick++) {
            uc.execute(tick);
            expect(repo.ids()).toEqual(["loaded"]);
            expect([...log.lines].sort()).toEqual(warnings);
            for (const { id, failures } of vehicles)
              expect(attempts.get(id)).toBe(Math.min(tick + 1, failures + 1));
          }
          const successfulReleases = vehicles.map(({ id }) => `release:${id}`);
          expect(
            world.calls.filter((call) => call.startsWith("release:")).sort(),
          ).toEqual(successfulReleases.sort());
          uc.execute(maxFailures + 1);
          for (const { id, failures } of vehicles)
            expect(attempts.get(id)).toBe(failures + 1);
          expect([...log.lines].sort()).toEqual(warnings);

          releaseSpy.mockRestore();
          const id = asVehicleId(defined(vehicles[0], "first gone vehicle").id);
          repo.save(createVehicle("suv", id, 0));
          world.failReleaseOn = id;
          log.lines.length = 0;
          uc.execute(maxFailures + 2);
          expect(log.lines).toEqual([`${id}: Error: release`]);
        },
      ),
    );
  });

  it("forwards ram hits to the world with the driver as the attacker", () => {
    const driver = riderView("d", {
      offset: { x: -0.38, z: 0.2 },
      raw: FULL_THROTTLE,
    });
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
    const driver = riderView("d", { offset: { x: -0.38, z: 0.2 }, yaw: 75 });
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

  it("isolates a vehicle tick when motion, a command, or cutting throws", () => {
    const fleet = fc
      .integer({ min: 2, max: 4 })
      .chain((size) =>
        fc.tuple(
          fc.constant(size),
          fc.integer({ min: 0, max: size - 1 }),
          fc.constantFrom("applyMotion", "bank", "gear_down", "cutColumns"),
        ),
      );

    fc.assert(
      fc.property(fleet, ([size, failing, port]) => {
        const world = new FakeWorld();
        const repo = new InMemoryRepo();
        const log = logger();
        const ids = Array.from({ length: size }, (_, index) =>
          asVehicleId(`vehicle-${index}`),
        );
        const bad = defined(ids[failing], "failing vehicle");
        const healthy = ids.filter((id) => id !== bad);
        const cut = [{ x: 9, z: 9, bottom: 64 }];
        const pave = {
          block: "minecraft:stone",
          cells: [{ x: 9, y: 63, z: 9 }],
        };
        const commands = [
          { type: "setProperty", name: "bank", value: 1 },
          { type: "setProperty", name: "gear_down", value: false },
        ] as const;
        const door = { type: "playAnimation", name: "door" } as const;

        world.snapshots = ids.map((id) => {
          const driver = riderView(`driver-${id}`, { raw: FULL_THROTTLE });
          const vehicleDrive = driveReturning(() => ({
            cut,
            pave,
            commands,
            boardDeckRiders: true,
            riders: { thirdPerson: true, underwater: true },
          }));
          repo.save(
            Vehicle.withRidersAboard(
              id,
              SUV_PROFILE,
              { ...vehicleDrive, onSeatVacated: () => [door] },
              [driver, riderView(`passenger-${id}`, { seat: 1 })],
              0,
            ),
          );
          return snapshot(id, { riders: [driver], headlights: true });
        });

        if (port === "applyMotion") world.failOn = bad;
        else if (port === "cutColumns") world.failCutOn = bad;
        else world.failRunOn = { id: bad, name: port };
        const run = vi.spyOn(world, "run");
        const motion = vi.spyOn(world, "applyMotion");
        const board = vi.spyOn(world, "boardDeckRiders");
        const layDock = vi.spyOn(world, "layDock");

        new DriveVehicles(world, repo, log).execute(0);

        const reachesMotion = port === "applyMotion" ? ids : healthy;
        expect(world.cuts).toEqual(
          reachesMotion.map((id) => ({ vehicleId: id, columns: cut })),
        );
        expect(world.paves).toEqual(
          reachesMotion.map((id) => ({ vehicleId: id, pave })),
        );
        expect(motion.mock.calls.map(([id]) => id)).toEqual(reachesMotion);
        expect(
          world.calls.filter((call) => call.startsWith("motion:")),
        ).toEqual(healthy.map((id) => `motion:${id}:0`));
        expect(board.mock.calls).toEqual(healthy.map((id) => [id]));
        expect(layDock.mock.calls).toEqual(healthy.map((id) => [id, []]));
        expect(run.mock.calls).toEqual(
          ids.flatMap((id) =>
            id === bad
              ? [[id, commands]]
              : [
                  [id, commands],
                  [id, [door]],
                ],
          ),
        );
        expect([...world.shone.keys()]).toEqual(healthy);
        for (const id of healthy)
          expect(world.shone.get(id)?.length).toBeGreaterThan(0);

        // Motion can fail after the tick has already collected its riders.
        expect(
          world.calls.filter((call) => call.startsWith("camera:")),
        ).toEqual(reachesMotion.map((id) => `camera:driver-${id}:mid`));
        expect(
          world.calls.filter((call) => call.startsWith("breathing:")),
        ).toEqual(
          reachesMotion.map(
            (id) => `breathing:driver-${id}:${SPEC.waterBreathingTicks}`,
          ),
        );
        const error =
          port === "bank" || port === "gear_down" ? `command ${port}` : "boom";
        expect(log.lines).toEqual([`${bad}: Error: ${error}`]);
      }),
    );
  });

  it("plays that seat's door sound when the driver's seat becomes empty", () => {
    const world = new FakeWorld();
    const repo = new InMemoryRepo();
    const uc = new DriveVehicles(world, repo, logger());
    const driver = riderView("d", { offset: { x: -0.38, z: 0.2 } });
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

  it("writes form, bank and landing gear only when their values change", () => {
    const id = asVehicleId("a");
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            moveX: fc.integer({ min: -1, max: 1 }),
            moveY: fc.integer({ min: -1, max: 1 }),
            jump: fc.boolean(),
            onGround: fc.boolean(),
            duration: fc.integer({ min: 1, max: 12 }),
          }),
          { minLength: 1, maxLength: 25 },
        ),
        (inputs) => {
          const world = new FakeWorld();
          const repo = new InMemoryRepo();
          const drive = new SuvDrive(0, { form: "car" });
          repo.save(new Vehicle(id, SUV_PROFILE, drive));
          const uc = new DriveVehicles(world, repo, logger());
          const run = vi.spyOn(world, "run");
          const propertyNames = ["form", "bank", "gear_down"] as const;
          let previous: Partial<
            Record<(typeof propertyNames)[number], unknown>
          > = { form: "car" };
          let tick = 0;
          for (const { onGround, duration, ...input } of inputs) {
            for (let i = 0; i < duration; i++) {
              const heading = forward(drive.yaw);
              const velocity = {
                x: heading.x * drive.speed,
                y: 0,
                z: heading.z * drive.speed,
              };
              world.snapshots = [
                snapshot(id, { testInput: input, onGround, velocity }),
              ];
              run.mockClear();
              uc.execute(tick++);
              const { bank, wheelsDown } = drive.inspect();
              const values = { form: drive.form, bank, gear_down: wheelsDown };
              const expected = propertyNames
                .filter((name) => values[name] !== previous[name])
                .map((name) => ({
                  type: "setProperty",
                  name,
                  value: values[name],
                }));
              const writes = run.mock.calls
                .flatMap(([, commands]) => commands)
                .filter(
                  (command) =>
                    command.type === "setProperty" &&
                    propertyNames.some((name) => name === command.name),
                );
              expect(writes).toEqual(expected);
              previous = values;
            }
          }
        },
      ),
    );
  });

  it.each([
    {
      property: "form",
      inputs: [
        { moveX: 0, moveY: 0, jump: true },
        { moveX: 0, moveY: 0, jump: false },
        { moveX: 0, moveY: 0, jump: true },
      ],
      value: "takeoff",
    },
    { property: "bank", inputs: [FULL_THROTTLE], value: "0" },
  ])(
    "still writes $property when moving the vehicle throws",
    ({ property, inputs, value }) => {
      const world = new FakeWorld();
      const uc = new DriveVehicles(world, new InMemoryRepo(), logger());
      world.failOn = "a";
      inputs.forEach((input, tick) => {
        world.snapshots = [snapshot("a", { testInput: input })];
        uc.execute(tick);
      });
      expect(world.calls).toContain(`${property}:a:${value}`);
    },
  );

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
  const rider = (id: string) => riderView(id, { offset: { x: -0.38, z: 0.2 } });
  const cameraCalls = (world: FakeWorld) =>
    world.calls.filter((c) => c.startsWith("camera:"));

  it("selects the rider's camera for their current mount and form", () => {
    const view = {
      suv: "mid",
      camper: "far",
      sportsboat: "own",
      bulldozer: "mid",
      scooter: "third",
    };
    const fleet = VEHICLE_KINDS.flatMap((kind) =>
      (kind === "sportsboat" ? [false] : [false, true]).map((flying) => ({
        id: `${kind}-${flying ? "air" : "ground"}`,
        kind,
        flying,
        camera: flying ? view[kind] : "own",
      })),
    );
    const mount = fc.option(fc.constantFrom(...fleet), { nil: undefined });

    fc.assert(
      fc.property(
        fc.array(mount, { minLength: 8, maxLength: 24 }),
        (mounts) => {
          const world = new FakeWorld();
          const log = logger();
          const drive = new DriveVehicles(world, new InMemoryRepo(), log);
          let applied = "own";
          const expected: string[] = [];
          for (const [tick, mounted] of mounts.entries()) {
            world.snapshots = fleet.map(({ id, kind, flying }) =>
              snapshot(id, {
                kind,
                restored: () => ({ form: flying ? "hover" : "car" }),
                onGround: !flying,
                testInput: flying ? FULL_THROTTLE : undefined,
                riders:
                  id === mounted?.id
                    ? [
                        riderView("p", {
                          offset: defined(
                            profileOf(kind).seats.positions[0],
                            "driver seat",
                          ),
                        }),
                      ]
                    : [],
              }),
            );
            const wanted = mounted?.camera ?? "own";
            if (wanted !== applied) expected.push(`camera:p:${wanted}`);
            applied = wanted;

            drive.execute(tick);
            expect(cameraCalls(world)).toEqual(expected);
            expect(log.lines).toEqual([]);
          }
        },
      ),
    );
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
});

describe("DriveVehicles submarine riders (ADR 0040)", () => {
  const rider = (id: string) => riderView(id, { offset: { x: -0.38, z: 0.2 } });
  const breathing = (id: string) =>
    `breathing:${id}:${SPEC.waterBreathingTicks}`;
  const breathingCalls = (world: FakeWorld) =>
    world.calls.filter((c) => c.startsWith("breathing:"));

  it("senses submersion and gives breathing to every submarine rider", () => {
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
    const refresh = [breathing("driver"), breathing("passenger")];
    expect(breathingCalls(world)).toEqual(refresh);
    uc.execute(SPEC.waterBreathingInterval);
    expect(breathingCalls(world)).toEqual([...refresh, ...refresh]);
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

it("keeps the rebuilt form on a second tick", () => {
  const world = new FakeWorld();
  const restored = () => ({ form: "hover" });
  world.snapshots = [
    snapshot("a", {
      restored,
      onGround: false,
      testInput: { moveX: 0, moveY: 0, jump: false },
    }),
  ];
  const uc = new DriveVehicles(world, new InMemoryRepo(), { warn: vi.fn() });
  uc.execute(0);
  expect(world.formOf("a")).toBe("hover");
  world.snapshots = [
    snapshot("a", {
      onGround: false,
      riders: [riderView("driver")],
      restored: () => ({ form: "car" }),
    }),
  ];
  uc.execute(1);
  expect(world.calls).toContain("camera:driver:mid");
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
    const drive = driveReturning((_raw, ctx) => {
      if (query) types = ctx.blockTypes([at, { ...at, y: 65 }]);
      return step;
    });
    repo.save(new Vehicle(asVehicleId("a"), SUV_PROFILE, drive));
    world.snapshots = [
      snapshot("a", {
        riders: driver
          ? [
              riderView("driver", {
                offset: defined(SUV_PROFILE.seats.positions[0], "driver seat"),
                raw: FULL_THROTTLE,
              }),
            ]
          : [],
      }),
    ];
    const driveVehicles = new DriveVehicles(world, repo, logger());
    const run = () => {
      driveVehicles.execute(0);
      return types;
    };
    return { world, at, run };
  }

  it("dispatches the requested dock and movement ports in step order", () => {
    const coordinate = fc.integer({ min: -32, max: 32 });
    const position = fc.record({
      x: coordinate,
      y: fc.integer({ min: 60, max: 70 }),
      z: coordinate,
    });
    const stone = "minecraft:stone";
    const cells = <T>(cell: fc.Arbitrary<T>) =>
      fc.array(cell, { maxLength: 2 });
    const optional = <T>(field: fc.Arbitrary<T>) =>
      fc.option(field, { nil: undefined });
    const step = fc.record({
      message: optional(fc.constantFrom("cannot_park", "clear_cargo")),
      clear: optional(cells(position.map((at) => ({ ...at, typeId: stone })))),
      cut: optional(
        cells(
          fc.record({
            x: coordinate,
            z: coordinate,
            bottom: fc.integer({ min: 60, max: 70 }),
          }),
        ),
      ),
      pave: optional(
        fc.record({ block: fc.constant(stone), cells: cells(position) }),
      ),
      dock: optional(
        fc.record({
          hold: position.map((at) => ({ ...at, yaw: 0 })),
          cells: cells(
            position.map((at) => ({
              ...at,
              block: { type: "floor" } as const,
            })),
          ),
          seats: fc.constant([]),
        }),
      ),
      boardDeckRiders: optional(fc.boolean()),
      depart: optional(
        position.map((at) => ({
          boxes: [{ min: at, max: { x: at.x + 3, y: at.y + 3, z: at.z + 4 } }],
          exit: { ...at, yaw: 90 },
        })),
      ),
      impulse: fc.record({ x: coordinate, y: fc.constant(0), z: coordinate }),
    });

    fc.assert(
      fc.property(step, fc.boolean(), (fields, driver) => {
        const { world, run } = fixture(fields, driver);
        const motion = vi.spyOn(world, "applyMotion");
        const board = vi.spyOn(world, "boardDeckRiders");
        const dock = vi.spyOn(world, "layDock");
        run();

        const { message, clear, cut, pave, depart, boardDeckRiders } = fields;
        const ports = [
          ["showMessage", message !== undefined && driver],
          ["clearBlocks", !!clear?.length],
          ["cutColumns", !!cut?.length],
          ["pave", !!pave?.cells.length],
          ["motion:a:0", fields.dock === undefined],
          ["boardDeckRiders", boardDeckRiders === true],
          ["seatStandingPlayers", depart !== undefined],
          ["layDock", true],
        ] as const;
        expect(
          world.calls.filter((call) => ports.some(([name]) => name === call)),
        ).toEqual(ports.filter(([, called]) => called).map(([name]) => name));

        expect(world.messages).toEqual(
          driver && message ? [{ playerId: "driver", name: message }] : [],
        );
        expect(world.cleared).toEqual(
          clear?.length ? [{ vehicleId: "a", cells: clear }] : [],
        );
        expect(world.cuts).toEqual(
          cut?.length ? [{ vehicleId: "a", columns: cut }] : [],
        );
        expect(world.paves).toEqual(
          pave?.cells.length ? [{ vehicleId: "a", pave }] : [],
        );
        expect(motion.mock.calls).toEqual(
          fields.dock ? [] : [["a", fields.impulse, 0]],
        );
        expect(board.mock.calls).toEqual(boardDeckRiders ? [["a"]] : []);
        expect(world.departures).toEqual(
          depart ? [{ vehicleId: "a", departure: depart }] : [],
        );
        expect(dock).toHaveBeenCalledExactlyOnceWith(
          "a",
          fields.dock?.cells ?? [],
        );
      }),
    );
  });

  it("clears checked blocks before laying dock cells in the same tick", () => {
    const cell = { x: 8, y: 64, z: 9 };
    const clear = [{ ...cell, typeId: "minecraft:short_grass" }];
    const { world, run } = fixture({
      clear,
      dock: {
        hold: { x: 0, y: 64, z: 0, yaw: 0 },
        cells: [{ ...cell, block: { type: "floor" } }],
        seats: [],
      },
    });
    run();
    expect(world.cleared).toEqual([{ vehicleId: "a", cells: clear }]);
    expect(
      world.calls.filter(
        (call) => call === "clearBlocks" || call === "layDock",
      ),
    ).toEqual(["clearBlocks", "layDock"]);
  });

  it("forwards lazy block queries with the vehicle id and world cells", () => {
    const { world, at, run } = fixture({}, false, true);
    const blockTypes = vi.spyOn(world, "blockTypes");
    expect(run()).toEqual(["minecraft:stone", "minecraft:air"]);
    expect(blockTypes).toHaveBeenCalledExactlyOnceWith("a", [
      at,
      { ...at, y: 65 },
    ]);
    const idle = fixture({});
    const unused = vi.spyOn(idle.world, "blockTypes");
    idle.run();
    expect(unused).not.toHaveBeenCalled();
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

  const namedFaults = fc.array(
    fc.option(
      fc.constantFrom("form", "bank", "gear_down", "gravity_on", "gravity_off"),
      { nil: undefined },
    ),
    { minLength: MAX_TICKS, maxLength: MAX_TICKS },
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
          namedFaults,
          (yaw, start, samples, plan, names) => {
            const reference = new FakeWorld();
            const faulty = new FakeWorld();
            reference.properties.set(id, { ...start });
            faulty.properties.set(id, { ...start });
            const referenceRepo = new InMemoryRepo();
            const good = new DriveVehicles(reference, referenceRepo, logger());
            const log = logger();
            const failing = new DriveVehicles(faulty, new InMemoryRepo(), log);
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
              const name = names[tick];
              faulty.failRunOn = name === undefined ? undefined : { id, name };
              const warnings = log.lines.length;
              tickBoth(s, tick);
              if (!faulted && log.lines.length === warnings) expectMirrored();
            });
            faulty.runFault = undefined;
            faulty.failRunOn = undefined;
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
        [CAMPER_SAVED.decor]: JSON.stringify([
          { slot: "stove", item: "lava_lamp" },
          { slot: "table", item: "oil_lamp" },
        ]),
      }),
    }),
  ];
  expect(() => new DriveVehicles(world, repo, log).execute(0)).not.toThrow();
  const vehicleId = asVehicleId("car");
  expect(repo.get(vehicleId)?.capability(CAMPER_ROOM)?.decor.decor()).toEqual(
    [],
  );
  expect(log.lines).toEqual([]);
  const saveDecor = vi.fn();
  expect(
    new SetDecor({ saveDecor }, repo).execute({
      vehicleId,
      slot: decorSlotId("stove"),
      item: decorItemId("toaster"),
    }),
  ).toBe(true);
  expect(saveDecor).toHaveBeenCalledWith(vehicleId, [
    { slot: "stove", item: "toaster" },
  ]);
});

it("applies scooter poses for both turning riders and none for an SUV", () => {
  const world = new FakeWorld();
  const repo = new InMemoryRepo();
  const uc = new DriveVehicles(world, repo, logger());
  let body = { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
  const applyMotion = world.applyMotion.bind(world);
  vi.spyOn(world, "applyMotion").mockImplementation((id, impulse, yaw) => {
    applyMotion(id, impulse, yaw);
    if (id === "scooter") body = engineStep(body, impulse, { mu: 0.688 }).body;
  });
  for (let tick = 1; tick < 80; tick++) {
    world.snapshots = [
      snapshot("scooter", {
        kind: "scooter",
        riders: [
          riderView("driver", { raw: { moveX: 1, moveY: 1, jump: false } }),
          riderView("passenger", { slot: 1 }),
        ],
        velocity: { ...body.vel, y: 0 },
      }),
      snapshot("suv", { riders: [riderView("suv-driver")] }),
    ];
    const callStart = world.calls.length;
    uc.execute(tick);
    const plays = world.calls
      .slice(callStart)
      .filter((c) => c.startsWith("play:"));
    if (tick % 20 === 0) expect(plays).toHaveLength(2);
    expect(plays.length).toBeLessThanOrEqual(2);
    expect(plays.filter((c) => c.startsWith("play:driver:"))).toEqual(
      plays
        .filter((c) => c.startsWith("play:passenger:"))
        .map((c) =>
          c.replace("play:passenger:scooter_pillion_", "play:driver:scooter_"),
        ),
    );
  }
  expect(world.calls).toContain("play:driver:scooter_grip");
  expect(world.calls).toContain("play:passenger:scooter_pillion_grip");
  expect(world.calls).toContain("play:driver:scooter_lean_l3");
  expect(world.calls).toContain("play:passenger:scooter_pillion_lean_l3");
  expect(world.calls.some((c) => c.startsWith("play:suv-driver:"))).toBe(false);
  world.snapshots = [
    snapshot("scooter", { kind: "scooter", riders: [riderView("driver")] }),
  ];
  uc.execute(81);
  uc.execute(82);
  expect(world.calls.filter((c) => c === "clearPose:passenger")).toEqual([
    "clearPose:passenger",
  ]);
});
it("resends rider poses after a pose port throws", () => {
  const world = new FakeWorld();
  world.snapshots = [
    snapshot("scooter", {
      kind: "scooter",
      riders: [riderView("driver"), riderView("passenger", { slot: 1 })],
    }),
  ];
  const play = vi.spyOn(world, "play").mockImplementationOnce(() => {
    throw new Error("pose send");
  });
  const uc = new DriveVehicles(world, new InMemoryRepo(), logger());
  uc.execute(1);
  play.mockClear();
  uc.execute(2);
  expect(play.mock.calls).toEqual([
    ["driver", "scooter_grip"],
    ["passenger", "scooter_pillion_grip"],
  ]);
});

it("plays no door when a rider leaves a doorless scooter", () => {
  const world = new FakeWorld();
  const log = { warn: vi.fn() };
  const drive = new DriveVehicles(world, new InMemoryRepo(), log);
  const run = vi.spyOn(world, "run");
  world.snapshots = [
    snapshot("v", { kind: "scooter", riders: [riderView("driver")] }),
  ];
  drive.execute(0);
  world.snapshots = [snapshot("v", { kind: "scooter" })];
  drive.execute(1);
  expect(run).toHaveBeenLastCalledWith("v", []);
  expect(log.warn).not.toHaveBeenCalled();
});
