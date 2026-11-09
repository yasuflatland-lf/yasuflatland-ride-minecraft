import { system } from "@minecraft/server";
import {
  beachChairClearCells,
  beachChairOrigin,
  beachChairPose,
  beachChairSupportCells,
} from "../../domain/resort/beachChair";
import { BEACH_CHAIR_SPEC } from "../../domain/resort/spec";
import { snapYaw4 } from "../../domain/shared/facing";
import {
  BEACH_CHAIR,
  BEACH_CHAIR_FOLDED,
  BEACH_CHAIR_ITEM,
  TEST_BEACH_CHAIR_HIT,
  TEST_BEACH_CHAIR_PLACE,
} from "../../infrastructure/resort/identifiers";
import { type Arena, wait } from "../arena";
import type { Outcome } from "../outcome";

export async function beachChairPlace(a: Arena): Promise<Outcome> {
  const block = a.at(100, a.gy - 1, 30);
  const failures: string[] = [];
  for (const yaw of [0, 90, 180, 270]) {
    const pose = beachChairPose(block, yaw);
    const near = () =>
      a.dim.getEntities({
        type: BEACH_CHAIR,
        location: beachChairOrigin(pose),
        maxDistance: 2,
      });
    const supports = beachChairSupportCells(pose);
    const clear = beachChairClearCells(pose);
    const saved = [...supports, ...clear].map((cell) => ({
      cell,
      permutation: a.dim.getBlock(cell)?.permutation,
    }));
    const place = async () => {
      system.sendScriptEvent(
        TEST_BEACH_CHAIR_PLACE,
        `${block.x} ${block.y} ${block.z} ${yaw}`,
      );
      await wait(2);
    };
    try {
      for (const cell of supports)
        a.dim.getBlock(cell)?.setType("minecraft:stone");
      for (const cell of clear) a.dim.getBlock(cell)?.setType("minecraft:air");
      for (const cell of supports) {
        a.dim.getBlock(cell)?.setType("minecraft:air");
        await place();
        if (near().length) failures.push(`unsupported yaw=${yaw}`);
        for (const entity of near()) entity.remove();
        a.dim.getBlock(cell)?.setType("minecraft:stone");
      }
      for (const cell of clear) {
        a.dim.getBlock(cell)?.setType("minecraft:stone");
        await place();
        if (near().length) failures.push(`obstructed yaw=${yaw}`);
        for (const entity of near()) entity.remove();
        a.dim.getBlock(cell)?.setType("minecraft:air");
      }
      await place();
      const entity = near()[0];
      const origin = beachChairOrigin(pose);
      if (
        !entity ||
        entity.location.x !== origin.x ||
        entity.location.y !== origin.y ||
        entity.location.z !== origin.z ||
        snapYaw4(entity.getRotation().y) !== pose.yaw ||
        entity.getProperty(BEACH_CHAIR_FOLDED) !== false
      )
        failures.push(`placement yaw=${yaw}`);
    } finally {
      for (const entity of near()) entity.remove();
      for (const { cell, permutation } of saved)
        if (permutation) a.dim.getBlock(cell)?.setPermutation(permutation);
    }
  }
  return {
    pass: failures.length === 0,
    detail:
      failures.join(", ") || "all headings, support and clearance verified",
  };
}

export async function beachChairTakeBack(a: Arena): Promise<Outcome> {
  const block = a.at(100, a.gy - 1, 30);
  const pose = beachChairPose(block, 0);
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
  try {
    system.sendScriptEvent(
      TEST_BEACH_CHAIR_PLACE,
      `${block.x} ${block.y} ${block.z} 0`,
    );
    await wait(2);
    const entity = near(BEACH_CHAIR)[0];
    if (!entity) return { pass: false, detail: "chair not placed" };
    for (let hit = 0; hit < BEACH_CHAIR_SPEC.hitsToTakeBack - 1; hit++) {
      system.sendScriptEvent(TEST_BEACH_CHAIR_HIT, entity.id);
      await wait(2);
    }
    const kept = entity.isValid && drops().length === 0;
    system.sendScriptEvent(TEST_BEACH_CHAIR_HIT, entity.id);
    await wait(2);
    const gone = !entity.isValid;
    const returned =
      drops().reduce(
        (sum, e) =>
          sum + (e.getComponent("minecraft:item")?.itemStack.amount ?? 0),
        0,
      ) === 1;
    return {
      pass: kept && gone && returned,
      detail: `kept=${kept} gone=${gone} returned=${returned}`,
    };
  } finally {
    for (const entity of [...near(BEACH_CHAIR), ...drops()]) entity.remove();
  }
}
