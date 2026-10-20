import fc from "fast-check";
import { beforeEach, describe, expect, it } from "vitest";
import type { HintPlayerView } from "../../../src/application/vehicle/ports/drive";
import { ShowVehicleHints } from "../../../src/application/vehicle/showVehicleHints";
import { HINTS } from "../../../src/domain/vehicle/hints";
import type { VehicleKind } from "../../../src/domain/vehicle/kind";
import { CAMPER_PROFILE } from "../../../src/domain/vehicle/kinds/camper/profile";
import { createVehicle } from "../../../src/domain/vehicle/kinds/index";
import { DOCK } from "../../../src/domain/vehicle/motion/dock";
import { SPEC } from "../../../src/domain/vehicle/spec";
import type { Vehicle } from "../../../src/domain/vehicle/vehicle";
import { defined } from "../../support/defined";
import { FakeClock, FakeHintWorld, InMemoryRepo } from "./fakes";

const AT = { x: 0.5, y: 64, z: 0.5 };
const BUMPER = defined(CAMPER_PROFILE.hints?.bumper, "bumper zone");
const SEAT0 = defined(CAMPER_PROFILE.seats.positions[0], "seat 0");
// Facing yaw 0, a vehicle's forward is +z and its left is +x.
const IN_FRONT = { x: AT.x, y: AT.y, z: AT.z + BUMPER.boxZ + 1 };
const FAR = { x: AT.x, y: AT.y, z: AT.z + 50 };
const STEP = SPEC.hintCheckInterval;
const HITS = { number: SPEC.hitsToBreak };
const CAMPER = { vehicle: "camper" };

function tickVehicle(vehicle: Vehicle, tick: number) {
  vehicle.tick({
    tick,
    riders: [],
    deckSeatInputs: [],
    location: AT,
    velocity: { x: 0, y: 0, z: 0 },
    onGround: true,
    solidAt: () => false,
    waterAt: () => false,
    targets: () => [],
    blockTypes: (cells) => cells.map(() => "minecraft:air"),
  });
}

let world: FakeHintWorld;
let repo: InMemoryRepo;
let clock: FakeClock;
let hints: ShowVehicleHints;

function checkAt(tick: number) {
  clock.tick = tick;
  hints.execute();
}

function addVehicle(kind: VehicleKind, id = "v", dimensionId = "overworld") {
  const vehicle = createVehicle(kind, id, 0);
  repo.save(vehicle);
  world.vehicles.push({ id, dimensionId, location: AT });
  return vehicle;
}

const player = (over: Partial<HintPlayerView> = {}): HintPlayerView => ({
  id: "p",
  dimensionId: "overworld",
  location: IN_FRONT,
  riding: false,
  held: "other",
  controls: "touch",
  ...over,
});

beforeEach(() => {
  world = new FakeHintWorld();
  repo = new InMemoryRepo();
  clock = new FakeClock();
  hints = new ShowVehicleHints(world, repo, clock);
});

describe("ShowVehicleHints (ADR 0086)", () => {
  it("does not scan players while no vehicle shows hints", () => {
    addVehicle("suv");
    addVehicle("sportsboat", "boat");
    world.players = [player()];
    checkAt(0);
    expect(world.playerScans).toBe(0);
    expect(world.sent).toEqual([]);
  });

  it("hints a player in front of the camper's bumper by their input and item", () => {
    addVehicle("camper");
    world.players = [
      player(),
      player({ id: "q", controls: "mouse" }),
      player({ id: "d", held: "dye" }),
    ];
    checkAt(0);
    expect(world.sent).toEqual([
      {
        playerId: "p",
        hint: { name: HINTS.bumperTouch, with: [HITS, CAMPER] },
      },
      {
        playerId: "q",
        hint: { name: HINTS.bumperMouse, with: [HITS, CAMPER] },
      },
      { playerId: "d", hint: { name: HINTS.paint, with: [CAMPER] } },
    ]);
  });

  it("hints nobody riding, far away, or in another dimension", () => {
    addVehicle("camper");
    world.players = [
      player({ riding: true }),
      player({ id: "far", location: FAR }),
      player({ id: "nether", dimensionId: "nether" }),
    ];
    checkAt(0);
    expect(world.sent).toEqual([]);
  });

  it("offers the free driver's seat of a parked camper", () => {
    const camper = addVehicle("camper");
    // Standing still for the dock's wait parks the camper (ADR 0068).
    for (let t = 0; t < DOCK.ticks; t++) tickVehicle(camper, t);
    world.players = [
      player({
        location: { x: AT.x + SEAT0.x, y: AT.y + 1, z: AT.z + SEAT0.z - 1 },
      }),
    ];
    checkAt(DOCK.ticks);
    expect(world.sent).toEqual([
      { playerId: "p", hint: { name: HINTS.driveTouch } },
    ]);
  });

  it("re-sends while the player stays, then stops, and clears once when they walk away", () => {
    addVehicle("camper");
    world.players = [player()];
    const shownAt: number[] = [];
    const end = SPEC.hintShowTicks * 2;
    for (let t = 0; t <= end; t += STEP) {
      const before = world.sent.length;
      checkAt(t);
      if (world.sent.length > before) shownAt.push(t);
    }
    const expected: number[] = [];
    for (let t = 0; t < SPEC.hintShowTicks; t += SPEC.hintRefreshTicks)
      expected.push(t);
    expect(shownAt).toEqual(expected);
    world.players = [player({ location: FAR })];
    checkAt(end + STEP);
    checkAt(end + 2 * STEP);
    expect(world.sent.at(-1)).toEqual({ playerId: "p" });
    expect(world.sent.filter((s) => s.hint === undefined)).toHaveLength(1);
  });

  it("leaves the action bar alone when the player mounts", () => {
    addVehicle("camper");
    world.players = [player()];
    checkAt(0);
    world.players = [player({ riding: true })];
    checkAt(STEP);
    world.players = [player({ riding: false, location: FAR })];
    checkAt(2 * STEP);
    expect(world.sent).toHaveLength(1);
  });

  it("forgets a player who left, so their hint shows at once when they come back", () => {
    addVehicle("camper");
    world.players = [player()];
    checkAt(0);
    world.players = [];
    checkAt(STEP);
    world.players = [player()];
    checkAt(2 * STEP);
    expect(world.sent).toHaveLength(2);
  });

  it("shows a new hint at once when the player picks up a dye", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100 }), (checks) => {
        world = new FakeHintWorld();
        repo = new InMemoryRepo();
        clock = new FakeClock();
        hints = new ShowVehicleHints(world, repo, clock);
        addVehicle("camper");
        world.players = [player()];
        for (let i = 0; i < checks; i++) checkAt(i * STEP);
        world.players = [player({ held: "dye" })];
        checkAt(checks * STEP);
        expect(world.sent.at(-1)).toEqual({
          playerId: "p",
          hint: { name: HINTS.paint, with: [CAMPER] },
        });
      }),
    );
  });
});
