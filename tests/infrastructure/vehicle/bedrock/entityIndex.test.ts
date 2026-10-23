import type { Entity } from "@minecraft/server";
import fc from "fast-check";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { asPlayerId, asVehicleId } from "../../../../src/domain/shared/ids";
import {
  DIMENSIONS,
  EntityIndex,
  loadedVehicleEntities,
} from "../../../../src/infrastructure/vehicle/bedrock/entityIndex";
import {
  PLAYER_TYPE,
  VEHICLE_FAMILY,
} from "../../../../src/infrastructure/vehicle/bedrock/identifiers";

const game = vi.hoisted(() => ({ getEntity: vi.fn(), getDimension: vi.fn() }));
vi.mock("@minecraft/server", () => ({ world: game }));

const stub = (id: string, isValid = true) =>
  ({ id, isValid }) as unknown as Entity;

describe("EntityIndex", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns a tracked valid entity without asking the world", () => {
    const index = new EntityIndex();
    const a = stub("a");
    index.track(a);
    expect(index.entity(asVehicleId("a"))).toBe(a);
    expect(game.getEntity).not.toHaveBeenCalled();
  });

  it("falls back to world.getEntity for an untracked id", () => {
    const index = new EntityIndex();
    const x = stub("x");
    game.getEntity.mockReturnValue(x);
    expect(index.entity(asVehicleId("x"))).toBe(x);
    expect(game.getEntity).toHaveBeenCalledWith("x");
  });

  it("returns undefined for an invalid or missing entity", () => {
    const index = new EntityIndex();
    index.track(stub("a", false));
    expect(index.entity(asVehicleId("a"))).toBeUndefined();
    game.getEntity.mockReturnValueOnce(stub("b", false));
    expect(index.entity(asVehicleId("b"))).toBeUndefined();
    game.getEntity.mockReturnValueOnce(undefined);
    expect(index.entity(asVehicleId("c"))).toBeUndefined();
  });

  it("lists the tracked entities until clear()", () => {
    const index = new EntityIndex();
    const a = stub("a");
    const b = stub("b", false);
    index.track(a);
    index.track(b);
    expect(index.tracked()).toEqual([a, b]);
    index.clear();
    expect(index.tracked()).toEqual([]);
  });

  it("forgets tracked entities on clear()", () => {
    const index = new EntityIndex();
    index.track(stub("a"));
    index.clear();
    expect(index.trackedIds()).toEqual(new Set());
    expect(index.entity(asVehicleId("a"))).toBeUndefined();
    expect(game.getEntity).toHaveBeenCalledWith("a");
  });

  it("player() returns only players", () => {
    const index = new EntityIndex();
    const player = { id: "p", typeId: PLAYER_TYPE };
    const cow = { id: "cow", typeId: "minecraft:cow" };
    game.getEntity.mockImplementation((id: string) =>
      id === "p" ? player : id === "cow" ? cow : undefined,
    );
    expect(index.player(asPlayerId("p"))).toBe(player);
    expect(index.player(asPlayerId("cow"))).toBeUndefined();
    expect(index.player(asPlayerId("missing"))).toBeUndefined();
  });

  it("tracked ids are exactly the tracked entities' ids, and each resolves to its own entity", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.string({ minLength: 1 }), { maxLength: 10 }),
        (ids) => {
          const index = new EntityIndex();
          const entities = new Map(ids.map((id) => [id, stub(id)]));
          for (const e of entities.values()) index.track(e);
          expect(index.trackedIds()).toEqual(new Set(ids));
          for (const [id, e] of entities)
            expect(index.entity(asVehicleId(id))).toBe(e);
          expect(game.getEntity).not.toHaveBeenCalled();
        },
      ),
    );
  });
});

it("scans every dimension once in order and preserves entity order", () => {
  fc.assert(
    fc.property(
      fc.tuple(
        fc.array(fc.string()),
        fc.array(fc.string()),
        fc.array(fc.string()),
      ),
      (idsByDimension) => {
        const entities = idsByDimension.map((ids) => ids.map((id) => stub(id)));
        const dimensions = entities.map((list) => ({
          getEntities: vi.fn(() => list),
        }));
        game.getDimension.mockReset();
        game.getDimension.mockImplementation(
          (id: (typeof DIMENSIONS)[number]) =>
            dimensions[DIMENSIONS.indexOf(id)],
        );
        const result = loadedVehicleEntities();
        const expected = entities.flat();
        expect(result).toEqual(expected);
        for (const [index, entity] of result.entries())
          expect(entity).toBe(expected[index]);
        expect(game.getDimension.mock.calls).toEqual(
          DIMENSIONS.map((id) => [id]),
        );
        for (const dimension of dimensions)
          expect(dimension.getEntities).toHaveBeenCalledExactlyOnceWith({
            families: [VEHICLE_FAMILY],
          });
      },
    ),
  );
});
