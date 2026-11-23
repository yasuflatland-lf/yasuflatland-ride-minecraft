import type { Entity } from "@minecraft/server";
import { beforeEach, expect, it, vi } from "vitest";
import type { HostedKindId } from "../../../src/application/shared/ports/hostedItem";
import {
  TopHostRegistry,
  type TopHostType,
  topHostView,
} from "../../../src/infrastructure/shared/tableTop/registry";

const game = vi.hoisted(() => ({ getEntity: vi.fn() }));
vi.mock("@minecraft/server", () => ({ world: game }));
beforeEach(() => vi.resetAllMocks());

const type: TopHostType = {
  hostType: "test_top",
  entityTypeId: "test:host",
  surface: {
    half: { halfX: 8, halfZ: 16 },
    topPx: 8,
    limit: 4,
    clearanceBase: 0,
  },
  isTopNow: () => true,
  refusalHints: {
    full: "test.full",
    overlap: "test.overlap",
    tooBig: "test.too_big",
  },
};

function fixture() {
  const registry = new TopHostRegistry();
  const getEntities = vi.fn((): Entity[] => []);
  const entity = {
    typeId: type.entityTypeId,
    isValid: true,
    dimension: { id: "minecraft:overworld", getEntities },
    location: { x: 4, y: 60, z: -2 },
    getRotation: () => ({ x: 0, y: 90 }),
  } as unknown as Entity;
  game.getEntity.mockReturnValue(entity);
  return { registry, entity, getEntities };
}

it("ignores unregistered host and hosted entity types", () => {
  const { registry, entity, getEntities } = fixture();
  expect(registry.hostTypeOf(entity)).toBeUndefined();
  expect(registry.host(type.hostType, "host")).toBeUndefined();
  expect(registry.itemsOnTop(type.hostType, "host")).toEqual([]);
  expect(registry.hostedOn(type.hostType, "host")).toEqual([]);
  expect(game.getEntity).not.toHaveBeenCalled();
  registry.registerHost(type);
  expect(registry.hostTypeOf(entity)).toBe(type);
  expect(registry.host(type.hostType, "host")).toEqual({ entity, type });
  expect(registry.itemsOnTop(type.hostType, "host")).toEqual([]);
  expect(getEntities).not.toHaveBeenCalled();
});

it("does not treat a registered entity as a host while isTopNow is false", () => {
  const { registry, entity, getEntities } = fixture();
  registry.registerHost({ ...type, isTopNow: () => false });
  expect(registry.hostTypeOf(entity)).toBeUndefined();
  expect(registry.host(type.hostType, "host")).toBeUndefined();
  expect(registry.itemsOnTop(type.hostType, "host")).toEqual([]);
  expect(registry.hostedOn(type.hostType, "host")).toEqual([]);
  expect(getEntities).not.toHaveBeenCalled();
});

it("scans registered kinds and matches both the host type and id, including legacy spots", () => {
  const { registry, getEntities } = fixture();
  const view = topHostView(registry);
  registry.registerHost({
    ...type,
    legacySpot: (spot) => (spot === 0 ? { x: -4, z: 0 } : undefined),
  });
  const footprint = { halfX: 2, halfZ: 3 };
  registry.registerHosted({
    kind: "test_item" as HostedKindId,
    entityTypeId: "test:item",
    hostProperty: "test:host",
    footprint,
  });
  const markers = [
    "test_top:host:@2,3",
    "test_top:host:0",
    "other_top:host:@2,3",
    "test_top:other:@2,3",
    "",
    "test_top:host:1",
  ];
  const entities = markers.map(
    (marker) =>
      ({
        getDynamicProperty: (key: string) =>
          key === "test:host" ? marker : undefined,
      }) as Entity,
  );
  getEntities.mockReturnValue(entities);
  expect(view.itemsOnTop(type.hostType, "host")).toEqual([
    { at: { x: 2, z: 3 }, footprint },
    { at: { x: -4, z: 0 }, footprint },
  ]);
  expect(registry.hostedOn(type.hostType, "host")).toEqual(
    entities.slice(0, 2),
  );
  expect(getEntities).toHaveBeenCalledWith({ type: "test:item" });
});

it("provides the available host pose and forwards footprint checks to the registered host", () => {
  const { registry, entity } = fixture();
  let available = true;
  const blockedAt = vi.fn(() => true);
  const view = topHostView(registry);
  expect(view.topHost(type.hostType, "host")).toBeUndefined();
  registry.registerHost({ ...type, isTopNow: () => available, blockedAt });
  const host = view.topHost(type.hostType, "host");
  expect(host).toMatchObject({
    dimension: "minecraft:overworld",
    at: { x: 4, y: 60, z: -2 },
    yaw: 90,
  });
  const point = { x: 3, z: 2 };
  const footprint = { halfX: 1, halfZ: 2 };
  expect(host?.blockedAt?.(point, footprint)).toBe(true);
  expect(blockedAt).toHaveBeenCalledExactlyOnceWith(entity, point, footprint);
  available = false;
  expect(view.topHost(type.hostType, "host")).toBeUndefined();
  expect(view.itemsOnTop(type.hostType, "host")).toEqual([]);
  registry.registerHost(type);
  expect(
    view.topHost(type.hostType, "host")?.blockedAt?.(point, footprint),
  ).toBe(false);
});

it("rejects missing, invalid, and mismatched host entities", () => {
  const { registry } = fixture();
  registry.registerHost(type);
  for (const entity of [
    undefined,
    { isValid: false, typeId: type.entityTypeId },
    { isValid: true, typeId: "test:other" },
  ]) {
    game.getEntity.mockReturnValue(entity);
    expect(registry.host(type.hostType, "host")).toBeUndefined();
  }
});
