import type { Dimension, Entity } from "@minecraft/server";
import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import type { Vec3 } from "../../../../src/domain/shared/vec";
import {
  type OwnedEntityKind,
  ownedEntity,
  placeOwned,
  TELEPORT_TOLERANCE,
} from "../../../../src/infrastructure/vehicle/bedrock/ownedEntities";

const world = vi.hoisted(() => ({ getEntity: vi.fn() }));
vi.mock("@minecraft/server", () => ({ world }));

const KIND: OwnedEntityKind = {
  ownerProperty: "test:owner",
  isType: (typeId) => typeId === "test:helper",
  searchRadius: 5,
};
const AT = { x: 0, y: 64, z: 0 };

function fixture() {
  const helper = {
    id: "helper",
    typeId: "test:helper",
    isValid: true,
    dimension: { id: "overworld" },
    location: AT,
    getDynamicProperty: vi.fn(() => "vehicle"),
    teleport: vi.fn(),
    remove: vi.fn(),
  };
  const entity = helper as unknown as Entity;
  const dimension = { id: "overworld", spawnEntity: vi.fn(() => entity) };
  const vehicle = { dimension } as unknown as Entity;
  const spawn = (dimension: Dimension, at: Vec3) =>
    dimension.spawnEntity(helper.typeId, at);
  return { helper, entity, dimension, vehicle, spawn };
}

describe("ownedEntity", () => {
  it("requires a valid helper of the right type that names the vehicle", () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        (valid, type, owner) => {
          const { helper, entity } = fixture();
          helper.isValid = valid;
          helper.typeId = type ? "test:helper" : "minecraft:cow";
          helper.getDynamicProperty.mockReturnValue(
            owner ? "vehicle" : "other",
          );
          world.getEntity.mockReturnValue(entity);
          expect(ownedEntity(helper.id, "vehicle", KIND)).toBe(
            valid && type && owner ? entity : undefined,
          );
          if (valid && type)
            expect(helper.getDynamicProperty).toHaveBeenCalledWith(
              KIND.ownerProperty,
            );
        },
      ),
    );
  });
});

describe("placeOwned", () => {
  it("spawns once and moves the helper only beyond the tolerance", () => {
    const { helper, entity, dimension, vehicle, spawn } = fixture();
    expect(placeOwned(undefined, vehicle, AT, spawn)).toBe(entity);
    expect(dimension.spawnEntity).toHaveBeenCalledExactlyOnceWith(
      helper.typeId,
      AT,
    );
    expect(
      placeOwned(entity, vehicle, { ...AT, x: TELEPORT_TOLERANCE }, spawn),
    ).toBe(entity);
    expect(helper.teleport).not.toHaveBeenCalled();
    const moved = { ...AT, x: TELEPORT_TOLERANCE + 0.01 };
    const options = { rotation: { x: 0, y: 90 } };
    expect(placeOwned(entity, vehicle, moved, spawn, options)).toBe(entity);
    expect(helper.teleport).toHaveBeenCalledExactlyOnceWith(moved, options);
    expect(dimension.spawnEntity).toHaveBeenCalledOnce();
  });

  it("replaces a helper in another dimension", () => {
    const { helper, entity, dimension, vehicle, spawn } = fixture();
    helper.dimension = { id: "nether" };
    const replacement = fixture().entity;
    dimension.spawnEntity.mockReturnValue(replacement);
    expect(placeOwned(entity, vehicle, AT, spawn)).toBe(replacement);
    expect(helper.remove).toHaveBeenCalledOnce();
    expect(dimension.spawnEntity).toHaveBeenCalledExactlyOnceWith(
      helper.typeId,
      AT,
    );
    expect(helper.teleport).not.toHaveBeenCalled();
  });

  it("lets the caller retry when the engine refuses to spawn or teleport", () => {
    const { helper, entity, dimension, vehicle, spawn } = fixture();
    const refusal = () => {
      throw new Error("LocationInUnloadedChunkError");
    };
    dimension.spawnEntity.mockImplementationOnce(refusal);
    helper.teleport.mockImplementationOnce(refusal);
    expect(placeOwned(undefined, vehicle, AT, spawn)).toBeUndefined();
    expect(placeOwned(entity, vehicle, { ...AT, x: 1 }, spawn)).toBeUndefined();
    expect(helper.remove).not.toHaveBeenCalled();
  });
});
