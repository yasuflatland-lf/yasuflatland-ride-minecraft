import {
  BlockPermutation,
  BlockTypes,
  type Entity,
  ItemStack,
  world,
} from "@minecraft/server";
import { KEPT_BLOCKS } from "../../domain/shared/keptBlocks";
import { id, LAID_BLOCK_TAG } from "../../infrastructure/shared/identifiers";
import { BladeCuts } from "../../infrastructure/vehicle/bedrock/bladeCuts";
import { decorBlockId } from "../../infrastructure/vehicle/bedrock/identifiers";
import { systemClock } from "../../infrastructure/vehicle/bedrock/systemClock";
import { type Arena, type Outcome, wait } from "../arena";

function cleanup(a: Arena): void {
  a.dim.runCommand(`fill 116 ${a.gy} 24 118 ${a.gy + 12} 30 air`);
}

export async function bladeCutColumn(a: Arena): Promise<Outcome> {
  const { dim, gy } = a;
  const cuts = new BladeCuts(systemClock);
  const set = (x: number, y: number, z: number, type: string) =>
    dim.getBlock({ x, y, z })?.setType(type);
  const at = (x: number, y: number, z: number) =>
    dim.getBlock({ x, y, z })?.typeId;
  try {
    cleanup(a);
    const stack = [
      "minecraft:stone",
      "minecraft:barrier",
      "minecraft:command_block",
      "minecraft:structure_block",
      "minecraft:reinforced_deepslate",
      "minecraft:end_portal_frame",
      "minecraft:light_block_15",
      "minecraft:chest",
      "minecraft:bedrock",
      id("camper_floor"),
      "minecraft:dirt",
    ];
    stack.forEach((type, i) => {
      set(117, gy + i, 25, type);
    });
    set(117, gy + 12, 25, "minecraft:stone");
    const chest = dim
      .getBlock({ x: 117, y: gy + 7, z: 25 })
      ?.getComponent("minecraft:inventory")?.container;
    if (!chest) throw new Error("chest inventory missing");
    chest.setItem(0, new ItemStack("minecraft:diamond"));
    const walls = [
      { x: 116, z: 27 },
      { x: 118, z: 27 },
      { x: 117, z: 26 },
      { x: 117, z: 28 },
    ];
    for (const p of walls) set(p.x, gy, p.z, "minecraft:stone");
    set(117, gy, 27, "minecraft:water");
    set(117, gy + 1, 27, "minecraft:stone");
    for (const y of [gy, gy + 2, gy + 3]) set(117, y, 29, "minecraft:stone");
    set(117, gy + 1, 29, "minecraft:campfire");
    set(118, gy, 25, "minecraft:stone");
    const floor = at(117, gy - 1, 25);
    cuts.cut(dim, [
      { x: 117, z: 25, bottom: gy },
      { x: 117, z: 27, bottom: gy },
      { x: 117, z: 29, bottom: gy, height: 3 },
    ]);
    const checks = [
      ...[0, 1, 2, 3, 4, 5, 6, 8, 10].map(
        (i) => at(117, gy + i, 25) === "minecraft:air",
      ),
      chest.getItem(0)?.typeId === "minecraft:diamond",
      chest.getItem(0)?.amount === 1,
      at(117, gy + 9, 25) === id("camper_floor"),
      at(117, gy + 12, 25) === "minecraft:stone",
      at(117, gy, 27) === "minecraft:water",
      ...walls.map((p) => at(p.x, gy, p.z) === "minecraft:stone"),
      at(117, gy + 1, 27) === "minecraft:air",
      at(117, gy, 29) === "minecraft:air",
      at(117, gy + 1, 29) === "minecraft:campfire",
      at(117, gy + 2, 29) === "minecraft:air",
      at(117, gy + 3, 29) === "minecraft:stone",
      at(118, gy, 25) === "minecraft:stone",
      at(117, gy - 1, 25) === floor,
    ];
    return {
      pass: checks.every(Boolean),
      detail: `checks=${checks.map(Number).join("")}`,
    };
  } finally {
    cleanup(a);
  }
}

export async function bladeCutDrops(a: Arena): Promise<Outcome> {
  const { dim, gy } = a;
  const cuts = new BladeCuts(systemClock);
  const lines: string[] = [];
  let cutTick = 0;
  let first: Entity | undefined;
  let second: Entity | undefined;
  const listener = (ev: { entity: Entity }) => {
    const p = ev.entity.location;
    const d = Math.max(
      117 - p.x,
      0,
      p.x - 118,
      gy - p.y,
      p.y - (gy + 1),
      30 - p.z,
      p.z - 31,
    );
    if (cuts.sweepDrop(ev.entity))
      lines.push(`removed dt=${systemClock.now() - cutTick} d=${d}`);
  };
  world.afterEvents.entitySpawn.subscribe(listener);
  try {
    cleanup(a);
    dim.getBlock({ x: 117, y: gy, z: 30 })?.setType("minecraft:stone");
    dim.runCommand(
      `setblock 118 ${gy} 30 torch ["torch_facing_direction"="east"]`,
    );
    if (dim.getBlock({ x: 118, y: gy, z: 30 })?.typeId !== "minecraft:torch")
      throw new Error("torch missing before cut");
    cutTick = systemClock.now();
    first = dim.spawnItem(new ItemStack("minecraft:diamond"), {
      x: 120.5,
      y: gy,
      z: 30.5,
    });
    cuts.cut(dim, [{ x: 117, z: 30, bottom: gy }]);
    await wait(3);
    second = dim.spawnItem(new ItemStack("minecraft:diamond"), {
      x: 117.5,
      y: gy,
      z: 30.5,
    });
    await wait(3);
    // The column box grown by DROP_MARGIN on every axis. Both controls are
    // checked by isValid instead: the first one spawns outside the box but
    // can roll into it before this query.
    const nearby = dim
      .getEntities({
        type: "minecraft:item",
        location: { x: 116, y: gy - 1, z: 29 },
        volume: { x: 3, y: 3, z: 3 },
      })
      .filter((e) => e.id !== first?.id && e.id !== second?.id);
    return {
      pass:
        dim.getBlock({ x: 118, y: gy, z: 30 })?.isAir === true &&
        lines.length === 1 &&
        nearby.length === 0 &&
        first.isValid &&
        second.isValid,
      detail: `removed=${lines.length} nearby=${nearby.length}${nearby.map((e) => ` ${e.getComponent("minecraft:item")?.itemStack.typeId}@${e.location.x.toFixed(2)},${e.location.y.toFixed(2)},${e.location.z.toFixed(2)}`).join("")} controls=${first.isValid},${second.isValid}`,
      lines,
    };
  } finally {
    world.afterEvents.entitySpawn.unsubscribe(listener);
    if (first?.isValid) first.remove();
    if (second?.isValid) second.remove();
    cleanup(a);
  }
}

export async function bladeCutKeptIds(): Promise<Outcome> {
  const missing = KEPT_BLOCKS.filter((type) => !BlockTypes.get(type));
  const untagged = [
    id("camper_floor"),
    id("deck_floor"),
    id("camper_wall"),
    id("tent_wall"),
    decorBlockId("toaster"),
  ].filter((type) => !BlockPermutation.resolve(type).hasTag(LAID_BLOCK_TAG));
  return {
    pass: missing.length === 0 && untagged.length === 0,
    detail: `missing=${missing.join(",")} untagged=${untagged.join(",")}`,
  };
}
