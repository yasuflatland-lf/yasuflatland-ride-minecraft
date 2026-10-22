import type { Entity } from "@minecraft/server";
import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { asVehicleId } from "../../../../src/domain/shared/ids";
import type { Vec3 } from "../../../../src/domain/shared/vec";
import type {
  StandInAxis,
  StandInPose,
} from "../../../../src/domain/vehicle/standIn";
import {
  ENTITY_TYPE,
  STAND_IN_FAMILY,
  STAND_IN_OF_PROPERTY,
  STAND_IN_PROPERTY,
  standInType,
} from "../../../../src/infrastructure/vehicle/bedrock/identifiers";
import {
  removeOrphanStandIn,
  StandIns,
  vehicleOfTarget,
} from "../../../../src/infrastructure/vehicle/bedrock/standIns";

const game = vi.hoisted(() => ({ getEntity: vi.fn(), getDimension: vi.fn() }));
vi.mock("@minecraft/server", () => ({ world: game }));

const NAME = "camper_bumper";

interface Fake {
  id: string;
  typeId: string;
  families: string[];
  location: Vec3;
  dimension: Entity["dimension"];
  isValid: boolean;
  saved: Map<string, unknown>;
  rideable: { ejectRiders: ReturnType<typeof vi.fn> };
  getDynamicProperty(key: string): unknown;
  setDynamicProperty(key: string, value: unknown): void;
  getComponent(name: string): unknown;
  teleport: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
}

function fixture() {
  const entities = new Map<string, Fake>();
  let next = 0;
  let unloaded = false;
  const dimension = {
    id: "overworld",
    spawnEntity: vi.fn((type: string, at: Vec3) => {
      if (unloaded) throw new Error("LocationInUnloadedChunkError");
      return entity(`standIn${next++}`, type, at);
    }),
    getEntities: vi.fn((options: { families?: string[] }) =>
      [...entities.values()].filter(
        (e) =>
          e.isValid &&
          (options.families === undefined ||
            options.families.some((f) => e.families.includes(f))),
      ),
    ),
  };
  function entity(
    id: string,
    typeId: string,
    at: Vec3 = { x: 0, y: 0, z: 0 },
  ): Fake {
    const saved = new Map<string, unknown>();
    const rideable = { ejectRiders: vi.fn() };
    const e: Fake = {
      id,
      typeId,
      families: typeId.startsWith(`yasu_ride:${NAME}_`)
        ? [STAND_IN_FAMILY, "inanimate"]
        : ["yasu_ride_vehicle"],
      location: at,
      dimension: dimension as unknown as Entity["dimension"],
      isValid: true,
      saved,
      rideable,
      getDynamicProperty: (key: string) => saved.get(key),
      setDynamicProperty: (key: string, value: unknown) => {
        if (value === undefined) saved.delete(key);
        else saved.set(key, value);
      },
      getComponent: (name: string) =>
        name === "minecraft:rideable" ? rideable : undefined,
      teleport: vi.fn((to: Vec3) => {
        e.location = to;
      }),
      remove: vi.fn(() => {
        e.isValid = false;
      }),
    };
    entities.set(id, e);
    return e;
  }
  const camper = entity("camper", ENTITY_TYPE.camper);
  game.getDimension.mockImplementation((id: string) =>
    id === dimension.id ? dimension : { getEntities: () => [] },
  );
  game.getEntity.mockImplementation((id: string) => {
    const e = entities.get(id);
    return e?.isValid ? e : undefined;
  });
  return {
    camper,
    car: camper as unknown as Entity,
    vehicleId: asVehicleId(camper.id),
    entities,
    dimension,
    entity,
    setUnloaded(value: boolean) {
      unloaded = value;
    },
    /** The valid stand-ins naming the camper. */
    standIns: () =>
      [...entities.values()].filter(
        (e) =>
          e.isValid &&
          e.families.includes(STAND_IN_FAMILY) &&
          e.saved.get(STAND_IN_OF_PROPERTY) === camper.id,
      ),
  };
}

const axis = fc.constantFrom<StandInAxis>("x", "z");
const pose = fc
  .record({
    x: fc.integer({ min: -20, max: 20 }),
    y: fc.integer({ min: 60, max: 70 }),
    z: fc.integer({ min: -20, max: 20 }),
    axis,
  })
  .map((p): StandInPose => ({ ...p, name: NAME }));

function expectOneAt(f: ReturnType<typeof fixture>, p: StandInPose): void {
  const standIns = f.standIns();
  expect(standIns).toHaveLength(1);
  const [standIn] = standIns;
  expect(standIn?.typeId).toBe(standInType(NAME, p.axis));
  expect(standIn?.location).toEqual({ x: p.x, y: p.y, z: p.z });
  expect(f.camper.saved.get(STAND_IN_PROPERTY)).toBe(standIn?.id);
}

describe("StandIns (ADR 0116)", () => {
  it("keeps exactly one stand-in per vehicle through moves, turns, reloads, strays, and removal", () => {
    const step = fc.oneof(
      pose.map((p) => ({ op: "keep" as const, p })),
      fc.constant({ op: "reload" as const }),
      fc.constant({ op: "stray" as const }),
      fc.constant({ op: "gone" as const }),
      fc.constant({ op: "release" as const }),
    );
    fc.assert(
      fc.property(pose, fc.array(step, { maxLength: 15 }), (first, steps) => {
        const f = fixture();
        let standIns = new StandIns();
        standIns.keep(f.vehicleId, f.car, first);
        expectOneAt(f, first);
        let last: StandInPose | undefined = first;
        for (const s of steps) {
          switch (s.op) {
            case "keep":
              standIns.keep(f.vehicleId, f.car, s.p);
              expectOneAt(f, s.p);
              last = s.p;
              break;
            case "reload":
              // Script memory is lost; the id saved on the vehicle survives.
              standIns = new StandIns();
              break;
            case "stray": {
              // A stand-in left behind, e.g. by a crash before its id was saved, that
              // loads with its chunk.
              const stray = f.entity(
                `stray${f.entities.size}`,
                standInType(NAME, "x"),
              );
              stray.saved.set(STAND_IN_OF_PROPERTY, f.camper.id);
              removeOrphanStandIn(stray as unknown as Entity);
              expect(stray.isValid).toBe(false);
              break;
            }
            case "gone":
              standIns.clearGone(new Set());
              if (last) expect(f.standIns()).toHaveLength(0);
              last = undefined;
              break;
            case "release":
              standIns.keep(f.vehicleId, f.car, undefined);
              expect(f.standIns()).toHaveLength(0);
              expect(f.camper.saved.has(STAND_IN_PROPERTY)).toBe(false);
              last = undefined;
              break;
          }
        }
        if (last) {
          standIns.keep(f.vehicleId, f.car, last);
          expectOneAt(f, last);
        }
        // A stray from an earlier session is swept on the first keep after a reload.
        f.entity("old", standInType(NAME, "z")).saved.set(
          STAND_IN_OF_PROPERTY,
          f.camper.id,
        );
        const end: StandInPose = { name: NAME, axis: "x", x: 1, y: 64, z: 1 };
        new StandIns().keep(f.vehicleId, f.car, end);
        expectOneAt(f, end);
      }),
    );
  });

  it("teleports a stand-in only past the tolerance, and never spawns another while it stands", () => {
    const f = fixture();
    const standIns = new StandIns();
    const at: StandInPose = { name: NAME, axis: "x", x: 0, y: 64, z: 3.7 };
    standIns.keep(f.vehicleId, f.car, at);
    const [standIn] = f.standIns();
    standIns.keep(f.vehicleId, f.car, { ...at, z: 3.72 });
    expect(standIn?.teleport).not.toHaveBeenCalled();
    standIns.keep(f.vehicleId, f.car, { ...at, z: 4.5 });
    expect(standIn?.teleport).toHaveBeenCalledExactlyOnceWith({
      x: 0,
      y: 64,
      z: 4.5,
    });
    expect(f.dimension.spawnEntity).toHaveBeenCalledOnce();
  });

  it("swaps the entity type when the row axis changes", () => {
    const f = fixture();
    const standIns = new StandIns();
    const at: StandInPose = { name: NAME, axis: "x", x: 0, y: 64, z: 3.7 };
    standIns.keep(f.vehicleId, f.car, at);
    const [first] = f.standIns();
    standIns.keep(f.vehicleId, f.car, { ...at, axis: "z" });
    expect(first?.remove).toHaveBeenCalledOnce();
    expect(f.standIns().map((e) => e.typeId)).toEqual([standInType(NAME, "z")]);
  });

  it("ejects anyone the engine seated on the stand-in", () => {
    const f = fixture();
    const standIns = new StandIns();
    const at: StandInPose = { name: NAME, axis: "z", x: 3.7, y: 64, z: 0 };
    standIns.keep(f.vehicleId, f.car, at);
    standIns.keep(f.vehicleId, f.car, at);
    expect(f.standIns()[0]?.rideable.ejectRiders).toHaveBeenCalledTimes(2);
  });

  it("skips a spot in an unloaded chunk without throwing, and spawns there once it loads", () => {
    const f = fixture();
    const standIns = new StandIns();
    const at: StandInPose = { name: NAME, axis: "x", x: 0, y: 64, z: 3.7 };
    f.setUnloaded(true);
    expect(() => standIns.keep(f.vehicleId, f.car, at)).not.toThrow();
    expect(f.standIns()).toHaveLength(0);
    expect(f.camper.saved.has(STAND_IN_PROPERTY)).toBe(false);
    f.setUnloaded(false);
    standIns.keep(f.vehicleId, f.car, at);
    expectOneAt(f, at);
  });

  it("removes the stand-in of a vehicle that is gone even when the vehicle entity is not given", () => {
    const f = fixture();
    const standIns = new StandIns();
    standIns.keep(f.vehicleId, f.car, {
      name: NAME,
      axis: "x",
      x: 0,
      y: 64,
      z: 3.7,
    });
    f.camper.isValid = false;
    standIns.keep(f.vehicleId, undefined, undefined);
    expect(f.standIns()).toHaveLength(0);
  });
});

describe("removeOrphanStandIn (ADR 0116)", () => {
  it("removes a loaded stand-in unless its vehicle is loaded near it and names it", () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        (ownerLoaded, named, isStandIn) => {
          const f = fixture();
          const other = f.entity(
            "other",
            isStandIn ? standInType(NAME, "z") : "minecraft:cow",
          );
          other.saved.set(STAND_IN_OF_PROPERTY, f.camper.id);
          f.camper.saved.set(STAND_IN_PROPERTY, named ? "other" : "another");
          f.camper.isValid = ownerLoaded;
          removeOrphanStandIn(other as unknown as Entity);
          expect(other.remove).toHaveBeenCalledTimes(
            isStandIn && !(ownerLoaded && named) ? 1 : 0,
          );
        },
      ),
    );
  });
});

describe("vehicleOfTarget (ADR 0116)", () => {
  it("is a vehicle itself, a stand-in's loaded vehicle, and nothing else", () => {
    const f = fixture();
    const standIn = f.entity("s", standInType(NAME, "x"));
    standIn.saved.set(STAND_IN_OF_PROPERTY, f.camper.id);
    const stray = f.entity("t", standInType(NAME, "z"));
    stray.saved.set(STAND_IN_OF_PROPERTY, "missing");
    const cow = f.entity("cow", "minecraft:cow");
    const target = (e: Fake) => vehicleOfTarget(e as unknown as Entity);
    expect(target(f.camper)).toBe(f.camper);
    expect(target(standIn)).toBe(f.camper);
    expect(target(stray)).toBeUndefined();
    expect(target(cow)).toBeUndefined();
    f.camper.isValid = false;
    expect(target(standIn)).toBeUndefined();
  });
});
