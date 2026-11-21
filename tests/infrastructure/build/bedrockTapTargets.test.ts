import { beforeEach, expect, it, vi } from "vitest";
import { asDimensionId, asPlayerId } from "../../../src/domain/shared/ids";
import { BedrockTapTargets } from "../../../src/infrastructure/build/bedrock/bedrockTapTargets";
import { TAP_TARGET_TYPE } from "../../../src/infrastructure/build/identifiers";

const engine = vi.hoisted(() => ({
  getEntity: vi.fn(),
  getDimension: vi.fn(),
}));
vi.mock("@minecraft/server", () => ({ world: engine }));

const playerId = asPlayerId("builder");
const overworld = asDimensionId("minecraft:overworld");
const nether = asDimensionId("minecraft:nether");
const cell = { x: -4, y: 64, z: 2 };
const at = { dimensionId: overworld, cell };

function entity(id: string) {
  const target = {
    id,
    typeId: TAP_TARGET_TYPE,
    isValid: true,
    teleport: vi.fn(),
    remove: vi.fn(() => {
      target.isValid = false;
    }),
  };
  return target;
}

function dimension(id: string) {
  const entities: ReturnType<typeof entity>[] = [];
  return {
    entities,
    spawnEntity: vi.fn(() => {
      const target = entity(`${id}-${entities.length}`);
      entities.push(target);
      return target;
    }),
    getEntities: vi.fn(() => entities.filter((entity) => entity.isValid)),
  };
}

const dimensionIds = ["overworld", "nether", "the_end"] as const;
let dimensions: Record<
  (typeof dimensionIds)[number],
  ReturnType<typeof dimension>
>;

function spawned(dimensionId: keyof typeof dimensions, index = 0) {
  const target = dimensions[dimensionId].entities[index];
  if (!target) throw new Error(`No target at index ${index} in ${dimensionId}`);
  return target;
}

beforeEach(() => {
  vi.resetAllMocks();
  dimensions = {
    overworld: dimension("overworld"),
    nether: dimension("nether"),
    the_end: dimension("the_end"),
  };
  engine.getDimension.mockImplementation(
    (id: string) =>
      dimensions[id.replace("minecraft:", "") as keyof typeof dimensions],
  );
  engine.getEntity.mockImplementation((id: string) =>
    Object.values(dimensions)
      .flatMap(({ entities }) => entities)
      .find((entity) => entity.id === id),
  );
});

it("spawns once for repeated placements in the same cell", () => {
  const targets = new BedrockTapTargets();
  targets.show(playerId, at);
  targets.show(playerId, { ...at, cell: { ...cell } });
  expect(dimensions.overworld.spawnEntity).toHaveBeenCalledExactlyOnceWith(
    TAP_TARGET_TYPE,
    { x: -3.5, y: 64, z: 2.5 },
  );
  const target = spawned("overworld");
  expect(target.teleport).not.toHaveBeenCalled();
  expect(targets.ownerOf(target.id)).toEqual({ playerId, ...at });
});

it("teleports an existing target to the new cell in its dimension", () => {
  const targets = new BedrockTapTargets();
  targets.show(playerId, at);
  const next = { ...cell, y: 66 };
  targets.show(playerId, { dimensionId: overworld, cell: next });
  const target = spawned("overworld");
  expect(dimensions.overworld.spawnEntity).toHaveBeenCalledTimes(1);
  expect(target.teleport).toHaveBeenCalledExactlyOnceWith({
    x: -3.5,
    y: 66,
    z: 2.5,
  });
  expect(targets.ownerOf(target.id)).toEqual({
    playerId,
    dimensionId: overworld,
    cell: next,
  });
});

it("removes and respawns a target across dimensions", () => {
  const targets = new BedrockTapTargets();
  targets.show(playerId, at);
  targets.show(playerId, { ...at, dimensionId: nether });
  const old = spawned("overworld");
  const next = spawned("nether");
  expect(old.remove).toHaveBeenCalledTimes(1);
  expect(old.teleport).not.toHaveBeenCalled();
  expect(targets.ownerOf(old.id)).toBeUndefined();
  expect(targets.ownerOf(next.id)).toEqual({
    playerId,
    cell,
    dimensionId: nether,
  });
});

it("replaces an invalid target even when the placement is unchanged", () => {
  const targets = new BedrockTapTargets();
  targets.show(playerId, at);
  const old = spawned("overworld");
  old.isValid = false;
  targets.show(playerId, at);
  const next = spawned("overworld", 1);
  expect(old.remove).not.toHaveBeenCalled();
  expect(targets.ownerOf(old.id)).toBeUndefined();
  expect(targets.ownerOf(next.id)).toEqual({ playerId, ...at });
});

it("hides and forgets a target", () => {
  const targets = new BedrockTapTargets();
  targets.show(playerId, at);
  const target = spawned("overworld");
  targets.hide(playerId);
  targets.hide(playerId);
  expect(target.remove).toHaveBeenCalledTimes(1);
  expect(targets.ownerOf(target.id)).toBeUndefined();
});

it("sweeps only unmapped targets in all three dimensions", () => {
  const targets = new BedrockTapTargets();
  targets.show(playerId, at);
  const owned = spawned("overworld");
  const orphans = Object.values(dimensions).map((dimension) =>
    dimension.spawnEntity(),
  );
  targets.sweep();
  expect(owned.remove).not.toHaveBeenCalled();
  for (const orphan of orphans) expect(orphan.remove).toHaveBeenCalledTimes(1);
  for (const dimension of Object.values(dimensions)) {
    expect(dimension.getEntities).toHaveBeenCalledExactlyOnceWith({
      type: TAP_TARGET_TYPE,
    });
  }
});
