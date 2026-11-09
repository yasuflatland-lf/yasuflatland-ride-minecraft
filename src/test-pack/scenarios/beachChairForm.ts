import { type Entity, system } from "@minecraft/server";
import {
  beachChairClearCells,
  beachChairOrigin,
  beachChairPose,
  beachChairSupportCells,
  tableBlockCells,
} from "../../domain/resort/beachChair";
import { BEACH_CHAIR_SPEC } from "../../domain/resort/spec";
import {
  BEACH_CHAIR,
  BEACH_CHAIR_FOLDED,
  BEACH_CHAIR_ITEM,
  BEACH_CHAIR_TOP,
  TEST_BEACH_CHAIR_FORM,
  TEST_BEACH_CHAIR_HIT,
  TEST_BEACH_CHAIR_PLACE,
} from "../../infrastructure/resort/identifiers";
import { type Arena, wait } from "../arena";
import type { Outcome } from "../outcome";

async function course(
  a: Arena,
  mode: "fold" | "block" | "restore",
): Promise<Outcome> {
  const block = a.at(100, a.gy - 1, 30);
  const pose = beachChairPose(block, 0);
  const cells = tableBlockCells(pose);
  const saved = [
    ...beachChairSupportCells(pose),
    ...beachChairClearCells(pose),
  ].map((cell) => ({ cell, permutation: a.dim.getBlock(cell)?.permutation }));
  const near = (type: string) =>
    a.dim.getEntities({
      type,
      location: beachChairOrigin(pose),
      maxDistance: 2,
    });
  const drops = () =>
    near("minecraft:item").filter(
      (e) =>
        e.getComponent("minecraft:item")?.itemStack.typeId === BEACH_CHAIR_ITEM,
    );
  const failures: string[] = [];
  const form = async (entity: Entity, operation: "fold" | "unfold") => {
    system.sendScriptEvent(TEST_BEACH_CHAIR_FORM, `${operation} ${entity.id}`);
    await wait(2);
  };
  try {
    for (const cell of beachChairSupportCells(pose))
      a.dim.getBlock(cell)?.setType("minecraft:stone");
    for (const cell of beachChairClearCells(pose))
      a.dim.getBlock(cell)?.setType("minecraft:air");
    system.sendScriptEvent(
      TEST_BEACH_CHAIR_PLACE,
      `${block.x} ${block.y} ${block.z} 0`,
    );
    await wait(2);
    const entity = near(BEACH_CHAIR)[0];
    if (!entity) return { pass: false, detail: "chair not placed" };
    await form(entity, "fold");
    if (
      entity.getProperty(BEACH_CHAIR_FOLDED) !== true ||
      !cells.every((c) => a.dim.getBlock(c)?.typeId === BEACH_CHAIR_TOP)
    )
      failures.push("table not laid");
    if (mode === "block") {
      const above = { ...cells[0], y: cells[0].y + 1 };
      a.dim.getBlock(above)?.setType("minecraft:stone");
      await form(entity, "unfold");
      if (entity.getProperty(BEACH_CHAIR_FOLDED) !== true)
        failures.push("loaded table unfolded");
      for (let hit = 0; hit < BEACH_CHAIR_SPEC.hitsToTakeBack; hit++) {
        system.sendScriptEvent(TEST_BEACH_CHAIR_HIT, entity.id);
        await wait(2);
      }
      if (!entity.isValid || drops().length)
        failures.push("loaded table recovered");
      a.dim.getBlock(above)?.setType("minecraft:air");
      // Refused hits must leave the counter unchanged.
      for (let hit = 0; hit < BEACH_CHAIR_SPEC.hitsToTakeBack - 1; hit++) {
        system.sendScriptEvent(TEST_BEACH_CHAIR_HIT, entity.id);
        await wait(2);
      }
      if (!entity.isValid || drops().length)
        failures.push("refused hits advanced counter");
    }
    if (mode === "restore") {
      for (const cell of cells) a.dim.getBlock(cell)?.setType("minecraft:air");
      await wait(BEACH_CHAIR_SPEC.topSyncTicks + 2);
      if (!cells.every((c) => a.dim.getBlock(c)?.typeId === BEACH_CHAIR_TOP))
        failures.push("table not restored");
    }
    await form(entity, "unfold");
    if (
      entity.getProperty(BEACH_CHAIR_FOLDED) !== false ||
      !cells.every((c) => a.dim.getBlock(c)?.isAir)
    )
      failures.push("chair retained top blocks");
    await form(entity, "fold");
    entity.remove();
    await wait(2);
    if (!cells.every((c) => a.dim.getBlock(c)?.isAir))
      failures.push("removed table retained blocks");
    return {
      pass: failures.length === 0,
      detail:
        failures.join(", ") || `${mode}: form, tabletop and cleanup verified`,
    };
  } finally {
    for (const entity of [...near(BEACH_CHAIR), ...drops()]) entity.remove();
    await wait(2);
    for (const { cell, permutation } of saved)
      if (permutation) a.dim.getBlock(cell)?.setPermutation(permutation);
  }
}
export function beachChairFold(a: Arena): Promise<Outcome> {
  return course(a, "fold");
}
export function beachChairBlockOnTop(a: Arena): Promise<Outcome> {
  return course(a, "block");
}
export function beachChairTopRestore(a: Arena): Promise<Outcome> {
  return course(a, "restore");
}
