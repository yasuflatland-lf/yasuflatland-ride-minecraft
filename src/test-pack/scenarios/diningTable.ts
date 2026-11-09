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
import { id } from "../../infrastructure/shared/identifiers";
import { type Arena, wait } from "../arena";
import type { Outcome } from "../outcome";

async function course(
  a: Arena,
  kind?: "gas_lantern" | "dutch_oven",
): Promise<Outcome> {
  const block = a.at(110, a.gy - 1, 15);
  const failures: string[] = [];
  const spec = FURNITURE_SPEC.dining_table;
  for (const yaw of kind ? [0] : [0, 90, 180, 270]) {
    const pose = furniturePose(block, yaw, "dining_table");
    const supports = furnitureSupportCells(pose);
    const clear = furnitureClearCells(pose);
    const saved = [...supports, ...clear].map((cell) => ({
      cell,
      permutation: a.dim.getBlock(cell)?.permutation,
    }));
    const near = (type: string) =>
      a.dim.getEntities({ type, location: pose.origin, maxDistance: 2 });
    const tables = () => near(FURNITURE_IDS.dining_table.entity);
    const drops = () =>
      near("minecraft:item").filter(
        (e) =>
          e.getComponent("minecraft:item")?.itemStack.typeId ===
          FURNITURE_IDS.dining_table.item,
      );
    const place = async () => {
      system.sendScriptEvent(
        TEST_FURNITURE_PLACE,
        `dining_table ${block.x} ${block.y} ${block.z} ${yaw}`,
      );
      await wait(2);
    };
    const hit = async (tableId: string) => {
      system.sendScriptEvent(TEST_FURNITURE_HIT, tableId);
      await wait(2);
    };
    try {
      for (const cell of supports)
        a.dim.getBlock(cell)?.setType("minecraft:stone");
      for (const cell of clear) a.dim.getBlock(cell)?.setType("minecraft:air");
      if (!kind) {
        for (const cell of supports) {
          a.dim.getBlock(cell)?.setType("minecraft:air");
          await place();
          if (tables().length) failures.push(`unsupported yaw=${yaw}`);
          for (const entity of tables()) entity.remove();
          a.dim.getBlock(cell)?.setType("minecraft:stone");
        }
        for (const cell of clear) {
          a.dim.getBlock(cell)?.setType("minecraft:stone");
          await place();
          if (tables().length) failures.push(`obstructed yaw=${yaw}`);
          for (const entity of tables()) entity.remove();
          a.dim.getBlock(cell)?.setType("minecraft:air");
        }
      }
      await place();
      const table = tables()[0];
      if (!table) return { pass: false, detail: "table not placed" };
      if (
        Math.abs(table.location.x - pose.origin.x) > 0.01 ||
        Math.abs(table.location.y - pose.origin.y) > 0.01 ||
        Math.abs(table.location.z - pose.origin.z) > 0.01 ||
        snapYaw4(table.getRotation().y) !== pose.yaw
      )
        failures.push(`pose yaw=${yaw}`);
      if (kind) {
        system.sendScriptEvent(
          id(`test_${kind}_on_top`),
          `dining_table ${table.id} 0 0`,
        );
        await wait(2);
        const hosted = near(id(kind));
        const item = hosted[0];
        if (
          hosted.length !== 1 ||
          !item ||
          !spec.top ||
          Math.abs(item.location.y - table.location.y - spec.top.topPx / 16) >
            0.01
        )
          failures.push(`${kind} not on tabletop`);
        for (let n = 0; n < spec.hitsToTakeBack; n++) await hit(table.id);
        if (!table.isValid || drops().length)
          return { pass: false, detail: "occupied table recovered" };
        for (const entity of hosted) entity.remove();
        await wait(2);
      }
      for (let n = 0; n < spec.hitsToTakeBack - 1; n++) await hit(table.id);
      if (!table.isValid || drops().length)
        failures.push("recovery before third unoccupied hit");
      await hit(table.id);
      if (table.isValid) failures.push("empty table not recovered");
      const returned = drops().reduce(
        (sum, entity) =>
          sum + (entity.getComponent("minecraft:item")?.itemStack.amount ?? 0),
        0,
      );
      if (returned !== 1) failures.push(`returned=${returned}`);
    } finally {
      for (const type of [
        FURNITURE_IDS.dining_table.entity,
        ...(kind ? [id(kind)] : []),
        "minecraft:item",
      ])
        for (const entity of near(type)) entity.remove();
      await wait(2);
      for (const { cell, permutation } of saved)
        if (permutation) a.dim.getBlock(cell)?.setPermutation(permutation);
    }
  }
  return {
    pass: failures.length === 0,
    detail:
      failures.join(", ") ||
      `${kind ?? "all headings"}: placement and recovery verified`,
  };
}

export function diningTablePlaceTakeBack(a: Arena): Promise<Outcome> {
  return course(a);
}
export function diningTableLantern(a: Arena): Promise<Outcome> {
  return course(a, "gas_lantern");
}
export function diningTableOven(a: Arena): Promise<Outcome> {
  return course(a, "dutch_oven");
}
