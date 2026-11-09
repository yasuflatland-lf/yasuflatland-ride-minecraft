import { system } from "@minecraft/server";
import {
  FURNITURE_SPEC,
  furnitureClearCells,
  furniturePose,
  furnitureSupportCells,
} from "../../domain/resort/furniture";
import { snapYaw4 } from "../../domain/shared/facing";
import {
  FURNITURE_IDS,
  TEST_FURNITURE_HIT,
  TEST_FURNITURE_PLACE,
} from "../../infrastructure/resort/identifiers";
import { type Arena, wait } from "../arena";
import type { Outcome } from "../outcome";

export async function sofaSinglePlaceTakeBack(a: Arena): Promise<Outcome> {
  const kind = "sofa_single";
  const ids = FURNITURE_IDS[kind];
  const block = a.at(110, a.gy - 1, 15);
  const failures: string[] = [];
  for (const yaw of [0, 90, 180, 270]) {
    const pose = furniturePose(block, yaw, kind);
    const near = (type: string) =>
      a.dim.getEntities({ type, location: pose.origin, maxDistance: 2 });
    const drops = () =>
      near("minecraft:item").filter(
        (e) => e.getComponent("minecraft:item")?.itemStack.typeId === ids.item,
      );
    const supports = furnitureSupportCells(pose);
    const clear = furnitureClearCells(pose);
    const saved = [...supports, ...clear].map((cell) => ({
      cell,
      permutation: a.dim.getBlock(cell)?.permutation,
    }));
    const place = async () => {
      system.sendScriptEvent(
        TEST_FURNITURE_PLACE,
        `${kind} ${block.x} ${block.y} ${block.z} ${yaw}`,
      );
      await wait(2);
    };
    try {
      for (const cell of clear) a.dim.getBlock(cell)?.setType("minecraft:air");
      for (const cell of supports)
        a.dim.getBlock(cell)?.setType("minecraft:air");
      await place();
      if (near(ids.entity).length) failures.push(`unsupported yaw=${yaw}`);
      for (const entity of near(ids.entity)) entity.remove();
      for (const cell of supports)
        a.dim.getBlock(cell)?.setType("minecraft:stone");
      for (const cell of clear) {
        a.dim.getBlock(cell)?.setType("minecraft:stone");
        await place();
        if (near(ids.entity).length) failures.push(`obstructed yaw=${yaw}`);
        for (const entity of near(ids.entity)) entity.remove();
        a.dim.getBlock(cell)?.setType("minecraft:air");
      }
      await place();
      const entity = near(ids.entity)[0];
      if (!entity) {
        failures.push(`not placed yaw=${yaw}`);
        continue;
      }
      if (
        near(ids.entity).length !== 1 ||
        snapYaw4(entity.getRotation().y) !== pose.yaw ||
        Math.abs(entity.location.x - pose.origin.x) > 0.01 ||
        Math.abs(entity.location.y - pose.origin.y) > 0.01 ||
        Math.abs(entity.location.z - pose.origin.z) > 0.01
      )
        failures.push(`pose yaw=${yaw}`);
      for (let hit = 1; hit <= FURNITURE_SPEC[kind].hitsToTakeBack; hit++) {
        system.sendScriptEvent(TEST_FURNITURE_HIT, entity.id);
        await wait(2);
        if (
          hit < FURNITURE_SPEC[kind].hitsToTakeBack &&
          (!entity.isValid || drops().length)
        )
          failures.push(`early recovery yaw=${yaw}`);
      }
      if (
        entity.isValid ||
        drops().reduce(
          (sum, e) =>
            sum + (e.getComponent("minecraft:item")?.itemStack.amount ?? 0),
          0,
        ) !== 1
      )
        failures.push(`recovery yaw=${yaw}`);
    } finally {
      for (const entity of [...near(ids.entity), ...drops()]) entity.remove();
      for (const { cell, permutation } of saved)
        if (permutation) a.dim.getBlock(cell)?.setPermutation(permutation);
    }
  }
  return {
    pass: failures.length === 0,
    detail:
      failures.join(", ") ||
      "all headings, support, clearance and three-hit recovery verified",
  };
}
