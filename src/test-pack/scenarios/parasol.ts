import { system } from "@minecraft/server";
import {
  parasolCeilingCells,
  parasolPose,
} from "../../domain/resort/parasolPose";
import { PARASOL_SPEC } from "../../domain/resort/spec";
import { snapYaw4 } from "../../domain/shared/facing";
import { PAINTS } from "../../domain/shared/paint";
import {
  BEACH_PARASOL,
  BEACH_PARASOL_ITEM,
  PARASOL_CEILING_BLOCK,
  TEST_PARASOL_HIT,
  TEST_PARASOL_PLACE,
} from "../../infrastructure/resort/identifiers";
import { PAINT_VARIANT, paintEvent } from "../../infrastructure/shared/dyes";
import { type Arena, wait } from "../arena";
import type { Outcome } from "../outcome";

async function course(a: Arena, rain: boolean): Promise<Outcome> {
  const block = a.at(100, a.gy - 1, 30);
  const pose = parasolPose(block, 0);
  const cells = parasolCeilingCells(pose);
  const near = (type: string) =>
    a.dim.getEntities({
      type,
      location: { x: pose.base.x + 0.5, y: pose.base.y, z: pose.base.z + 0.5 },
      maxDistance: 2,
    });
  const drops = () =>
    near("minecraft:item").filter(
      (e) =>
        e.getComponent("minecraft:item")?.itemStack.typeId ===
        BEACH_PARASOL_ITEM,
    );
  try {
    system.sendScriptEvent(
      TEST_PARASOL_PLACE,
      `${block.x} ${block.y} ${block.z} 0`,
    );
    await wait(2);
    const entity = near(BEACH_PARASOL)[0];
    if (!entity) return { pass: false, detail: "parasol not placed" };
    const placed =
      Math.floor(entity.location.z) === pose.base.z &&
      snapYaw4(entity.getRotation().y) === pose.yaw;
    const covered = cells.every(
      (cell) => a.dim.getBlock(cell)?.typeId === PARASOL_CEILING_BLOCK,
    );
    let restored = true;
    if (rain) {
      const cell = cells[0];
      if (!cell) return { pass: false, detail: "empty canopy footprint" };
      a.dim.getBlock(cell)?.setType("minecraft:air");
      await wait(PARASOL_SPEC.ceilingSyncTicks + 2);
      restored = a.dim.getBlock(cell)?.typeId === PARASOL_CEILING_BLOCK;
    }
    for (let hit = 0; hit < PARASOL_SPEC.hitsToTakeBack - 1; hit++) {
      system.sendScriptEvent(TEST_PARASOL_HIT, entity.id);
      await wait(2);
    }
    const kept = entity.isValid && drops().length === 0;
    system.sendScriptEvent(TEST_PARASOL_HIT, entity.id);
    await wait(2);
    const gone =
      !entity.isValid &&
      drops().reduce(
        (sum, e) =>
          sum + (e.getComponent("minecraft:item")?.itemStack.amount ?? 0),
        0,
      ) === 1;
    const clear = cells.every((cell) => a.dim.getBlock(cell)?.isAir === true);
    return {
      pass: placed && covered && restored && kept && gone && clear,
      detail: `placed=${placed} covered=${covered} restored=${restored} kept=${kept} gone=${gone} clear=${clear}`,
    };
  } finally {
    for (const entity of [...near(BEACH_PARASOL), ...drops()]) entity.remove();
    await wait(2);
    for (const cell of cells)
      if (a.dim.getBlock(cell)?.typeId === PARASOL_CEILING_BLOCK)
        a.dim.getBlock(cell)?.setType("minecraft:air");
  }
}
export function parasolPlaceTakeBack(a: Arena): Promise<Outcome> {
  return course(a, false);
}
export function parasolRainCeiling(a: Arena): Promise<Outcome> {
  return course(a, true);
}

export async function parasolPaint(a: Arena): Promise<Outcome> {
  const block = a.at(100, a.gy - 1, 30);
  const pose = parasolPose(block, 0);
  const cells = parasolCeilingCells(pose);
  const near = () =>
    a.dim.getEntities({
      type: BEACH_PARASOL,
      location: { x: pose.base.x + 0.5, y: pose.base.y, z: pose.base.z + 0.5 },
      maxDistance: 2,
    });
  try {
    system.sendScriptEvent(
      TEST_PARASOL_PLACE,
      `${block.x} ${block.y} ${block.z} 0`,
    );
    await wait(2);
    const entity = near()[0];
    if (!entity) return { pass: false, detail: "parasol not placed" };
    const wrong: string[] = [];
    for (const paint of [...PAINTS.slice(1), PAINTS[0]]) {
      entity.triggerEvent(paintEvent(paint));
      await wait(1);
      const variant = entity.getComponent("minecraft:variant")?.value;
      if (variant !== PAINT_VARIANT[paint]) wrong.push(`${paint}=${variant}`);
    }
    return { pass: wrong.length === 0, detail: `wrong=[${wrong.join(",")}]` };
  } finally {
    for (const entity of near()) entity.remove();
    await wait(2);
    for (const cell of cells)
      if (a.dim.getBlock(cell)?.typeId === PARASOL_CEILING_BLOCK)
        a.dim.getBlock(cell)?.setType("minecraft:air");
  }
}
