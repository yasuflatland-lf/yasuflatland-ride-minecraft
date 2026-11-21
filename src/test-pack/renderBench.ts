import {
  BlockPermutation,
  type Dimension,
  type Player,
  system,
  type Vector3,
  world,
} from "@minecraft/server";
import { TENT_TYPE } from "../infrastructure/camp/identifiers";
import { AIR_BLOCK, id } from "../infrastructure/shared/identifiers";
import { ENTITY_TYPE } from "../infrastructure/vehicle/bedrock/identifiers";

const BENCH = "yasu_ride_test:bench";
const entityTypes = new Map(
  Object.entries({ ...ENTITY_TYPE, tent: TENT_TYPE }),
);
const gearBlock = id("table_decor_pair");

export function gridCells(count: number, spacing: number) {
  const width = Math.ceil(Math.sqrt(count));
  return Array.from({ length: count }, (_, index) => ({
    x: (index % width) * spacing,
    z: Math.floor(index / width) * spacing,
  }));
}

function clearScene(dimension: Dimension): void {
  for (const entity of dimension.getEntities({ tags: [BENCH] }))
    entity.remove();
  // Blocks cannot carry entity tags. Keep their locations across script reloads.
  const key = gearLocationsKey(dimension);
  const saved = world.getDynamicProperty(key);
  if (typeof saved !== "string") return;
  const positions: Vector3[] = JSON.parse(saved);
  for (const position of positions) {
    const block = dimension.getBlock(position);
    if (!block)
      throw new Error("Return to the previous gear grid to clear it.");
    if (block.typeId === gearBlock) block.setType(AIR_BLOCK);
  }
  world.setDynamicProperty(key, undefined);
}

function gearLocationsKey(dimension: Dimension): string {
  return `${BENCH}_gear_${dimension.id.split(":").pop()}`;
}

function buildScene(player: Player, kind: string, count: number): void {
  const type = entityTypes.get(kind);
  if (!type && kind !== "gear")
    throw new Error(
      "Choose camper, suv, scooter, bulldozer, sportsboat, tent or gear.",
    );
  const dimension = player.dimension;
  clearScene(dimension);

  // Cardinal axes keep one-block gear cells distinct at every player heading.
  const yaw = Math.round(player.getRotation().y / 90) * 90;
  const radians = (yaw * Math.PI) / 180;
  const sin = Math.round(Math.sin(radians));
  const cos = Math.round(Math.cos(radians));
  const origin = player.location;
  const at = (x: number, z: number): Vector3 => ({
    x: Math.floor(origin.x) + 0.5 + x * cos - (6 + z) * sin,
    y: Math.floor(origin.y),
    z: Math.floor(origin.z) + 0.5 + x * sin + (6 + z) * cos,
  });
  const cells = gridCells(count, type ? 6 : 1);
  const positions = cells.map(({ x, z }) => at(x, z));
  if (type) {
    for (const location of positions) {
      const query = { type, location, maxDistance: 0.5 };
      if (dimension.getEntities(query).length)
        throw new Error("A grid cell is occupied.");
      const { x, y, z } = location;
      dimension.runCommand(`summon ${type} ${x} ${y} ${z}`);
      const entity = dimension.getEntities(query)[0];
      if (!entity) throw new Error(`Could not find ${type} at ${x} ${y} ${z}.`);
      entity.addTag(BENCH);
    }
  } else {
    const blocks = positions.map((position) => {
      const block = dimension.getBlock(position);
      if (!block?.isAir)
        throw new Error("The gear grid needs clear air in loaded chunks.");
      return block;
    });
    const gear = BlockPermutation.resolve(gearBlock, {
      [id("end0_item")]: 1,
      [id("end1_item")]: 2,
    });
    world.setDynamicProperty(
      gearLocationsKey(dimension),
      JSON.stringify(blocks.map((block) => block.location)),
    );
    for (const block of blocks) block.setPermutation(gear);
  }
  const centreX = Math.max(...cells.map((cell) => cell.x)) / 2;
  const centreZ = Math.max(...cells.map((cell) => cell.z)) / 2;
  const camera = at(centreX, centreZ - 4);
  camera.y += 6;
  player.teleport(camera, { rotation: { x: 30, y: yaw } });
}

system.afterEvents.scriptEventReceive.subscribe((event) => {
  if (event.id !== BENCH || event.sourceEntity?.typeId !== "minecraft:player")
    return;
  const player = event.sourceEntity as Player;
  try {
    const message = event.message.trim();
    if (message === "clear") {
      clearScene(player.dimension);
      return;
    }
    const [kind, rawCount = "16", extra] = message.split(/\s+/);
    const count = Number(rawCount);
    if (extra || !/^\d+$/.test(rawCount) || count < 1 || count > 64)
      throw new Error(
        "Use <kind> [count], with an integer count from 1 to 64.",
      );
    buildScene(player, kind ?? "", count);
  } catch (error) {
    player.sendMessage(`[bench] ${String(error)}`);
  }
});
