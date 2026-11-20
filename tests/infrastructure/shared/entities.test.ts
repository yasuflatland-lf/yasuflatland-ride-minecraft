import type { Dimension, Entity } from "@minecraft/server";
import { expect, it, vi } from "vitest";
import * as entities from "../../../src/infrastructure/shared/entities";

const at = { x: 1, y: 64, z: 2 };

function fixture() {
  const entity = { setRotation: vi.fn(), remove: vi.fn() };
  const spawnEntity = vi.fn(() => entity);
  const dimension = { spawnEntity } as unknown as Dimension;
  return { dimension, entity, spawnEntity };
}

it("returns undefined when the engine refuses to spawn", () => {
  const { dimension, spawnEntity } = fixture();
  spawnEntity.mockImplementation(() => {
    throw new Error("unloaded chunk");
  });
  expect(
    entities.spawnWithRollback(dimension, "test:entity", at, 90),
  ).toBeUndefined();
});

it.each(["rotation", "setup"])("removes the entity when %s throws", (stage) => {
  const { dimension, entity } = fixture();
  const throwUnloaded = () => {
    throw new Error("unloaded chunk");
  };
  const setup = vi.fn<(entity: Entity) => void>();
  if (stage === "rotation")
    entity.setRotation.mockImplementation(throwUnloaded);
  else setup.mockImplementation(throwUnloaded);

  expect(
    entities.spawnWithRollback(dimension, "test:entity", at, 90, setup),
  ).toBeUndefined();
  expect(entity.setRotation).toHaveBeenCalledExactlyOnceWith({ x: 0, y: 90 });
  expect(setup).toHaveBeenCalledTimes(stage === "setup" ? 1 : 0);
  expect(entity.remove).toHaveBeenCalledOnce();
});

it("still returns undefined when removing the failed entity throws", () => {
  const { dimension, entity } = fixture();
  entity.remove.mockImplementation(() => {
    throw new Error("unloaded chunk");
  });
  const result = entities.spawnWithRollback(
    dimension,
    "test:entity",
    at,
    90,
    () => {
      throw new Error("failed setup");
    },
  );
  expect(result).toBeUndefined();
  expect(entity.remove).toHaveBeenCalledOnce();
});
