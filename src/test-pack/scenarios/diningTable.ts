import { system } from "@minecraft/server";
import {
  FURNITURE_SPEC,
  FURNITURE_TOP_SYNC_TICKS,
  furnitureClearCells,
  furniturePose,
  furnitureSupportCells,
} from "../../domain/resort/furniture";
import { snapYaw4 } from "../../domain/shared/facing";
import {
  DINING_TABLE_TOP,
  FURNITURE_IDS,
  TEST_FURNITURE_BLOCK,
  TEST_FURNITURE_HIT,
  TEST_FURNITURE_PLACE,
  TEST_FURNITURE_TOP,
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
          TEST_FURNITURE_TOP,
          `${kind} ${block.x} ${block.y + 1} ${block.z}`,
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

async function topCourse(
  a: Arena,
  mode: "clear" | "above" | "restore",
): Promise<Outcome> {
  const support = a.at(110, a.gy - 1, 15);
  const cell = { ...support, y: support.y + 1 };
  const above = { ...cell, y: cell.y + 1 };
  const saved = [support, cell, above].map((at) => ({
    at,
    permutation: a.dim.getBlock(at)?.permutation,
  }));
  const near = (type: string) =>
    a.dim.getEntities({ type, location: cell, maxDistance: 3 });
  const failures: string[] = [];
  try {
    a.dim.getBlock(support)?.setType("minecraft:stone");
    for (const at of [cell, above])
      a.dim.getBlock(at)?.setType("minecraft:air");
    system.sendScriptEvent(
      TEST_FURNITURE_PLACE,
      `dining_table ${support.x} ${support.y} ${support.z} 0`,
    );
    await wait(2);
    const table = near(FURNITURE_IDS.dining_table.entity)[0];
    if (!table) return { pass: false, detail: "table not placed" };
    if (a.dim.getBlock(cell)?.typeId !== DINING_TABLE_TOP)
      failures.push("top not laid");
    const recover = async () => {
      for (let n = 0; n < FURNITURE_SPEC.dining_table.hitsToTakeBack; n++) {
        system.sendScriptEvent(TEST_FURNITURE_HIT, table.id);
        await wait(2);
      }
    };
    if (mode === "restore") {
      a.dim.getBlock(cell)?.setType("minecraft:air");
      await wait(FURNITURE_TOP_SYNC_TICKS + 2);
      if (a.dim.getBlock(cell)?.typeId !== DINING_TABLE_TOP)
        failures.push("top not restored");
    }
    if (mode === "above") {
      a.dim.getBlock(above)?.setType("minecraft:stone");
      await recover();
      if (!table.isValid || near("minecraft:item").length)
        return { pass: false, detail: "recovered with block above" };
      if (a.dim.getBlock(above)?.typeId !== "minecraft:stone")
        failures.push("block above lost");
      a.dim.getBlock(above)?.setType("minecraft:air");
    }
    await recover();
    if (table.isValid) failures.push("table not recovered");
    if (a.dim.getBlock(cell)?.isAir !== true) failures.push("top not cleared");
    await wait(FURNITURE_TOP_SYNC_TICKS + 2);
    if (a.dim.getBlock(cell)?.isAir !== true)
      failures.push("top returned after recovery");
  } finally {
    for (const type of [FURNITURE_IDS.dining_table.entity, "minecraft:item"])
      for (const entity of near(type)) entity.remove();
    await wait(2);
    for (const { at, permutation } of saved)
      if (permutation) a.dim.getBlock(at)?.setPermutation(permutation);
  }
  return {
    pass: failures.length === 0,
    detail: failures.join(", ") || `top ${mode} verified`,
  };
}
export function diningTableTopLayClear(a: Arena): Promise<Outcome> {
  return topCourse(a, "clear");
}
export function diningTableBlockOnTop(a: Arena): Promise<Outcome> {
  return topCourse(a, "above");
}
export function diningTableTopRestore(a: Arena): Promise<Outcome> {
  return topCourse(a, "restore");
}

export async function diningTableTopOverlap(a: Arena): Promise<Outcome> {
  const support = a.at(110, a.gy - 1, 15);
  const cells = [0, 2].map((dx) => ({
    x: support.x + dx,
    y: support.y + 1,
    z: support.z,
  }));
  const saved = cells.flatMap((cell) =>
    [-1, 0, 1, 2].map((dy) => {
      const at = { ...cell, y: cell.y + dy };
      return { at, permutation: a.dim.getBlock(at)?.permutation };
    }),
  );
  const near = (type: string) =>
    a.dim.getEntities({ type, location: cells[0], maxDistance: 4 });
  const failures: string[] = [];
  const event = async (name: string, value: string) => {
    system.sendScriptEvent(name, value);
    await wait(3);
  };
  try {
    for (const cell of cells) {
      a.dim.getBlock({ ...cell, y: cell.y - 1 })?.setType("minecraft:stone");
      for (const dy of [0, 1, 2])
        a.dim.getBlock({ ...cell, y: cell.y + dy })?.setType("minecraft:air");
      await event(
        TEST_FURNITURE_PLACE,
        `dining_table ${cell.x} ${cell.y - 1} ${cell.z} 0`,
      );
    }
    if (near(FURNITURE_IDS.dining_table.entity).length !== 2)
      return { pass: false, detail: "tables not placed" };
    for (const kind of ["gas_lantern", "dutch_oven"]) {
      const first = cells[0];
      const second = cells[1];
      if (!first || !second) throw Error("missing cells");
      const above = { ...first, y: first.y + 1 };
      a.dim.getBlock(above)?.setType("minecraft:stone");
      await event(
        TEST_FURNITURE_TOP,
        `${kind} ${first.x} ${first.y} ${first.z}`,
      );
      if (near(id(kind)).length !== 0) failures.push(`${kind} overlaps block`);
      await event(
        TEST_FURNITURE_TOP,
        `${kind} ${second.x} ${second.y} ${second.z}`,
      );
      if (near(id(kind)).length !== 1)
        failures.push(`${kind} refused on separate table`);
      await event(
        TEST_FURNITURE_BLOCK,
        `${second.x} ${second.y + 1} ${second.z}`,
      );
      if (a.dim.getBlock({ ...second, y: second.y + 1 })?.isAir !== true)
        failures.push(`block overlaps ${kind}`);
      for (const entity of near(id(kind))) entity.remove();
      await event(
        TEST_FURNITURE_BLOCK,
        `${second.x} ${second.y + 1} ${second.z}`,
      );
      if (
        a.dim.getBlock({ ...second, y: second.y + 1 })?.typeId !==
        "minecraft:stone"
      )
        failures.push("empty top refused block");
      for (const cell of cells)
        a.dim.getBlock({ ...cell, y: cell.y + 1 })?.setType("minecraft:air");
    }
  } finally {
    for (const type of [
      FURNITURE_IDS.dining_table.entity,
      id("gas_lantern"),
      id("dutch_oven"),
      "minecraft:item",
    ])
      for (const entity of near(type)) entity.remove();
    await wait(2);
    for (const { at, permutation } of saved)
      if (permutation) a.dim.getBlock(at)?.setPermutation(permutation);
  }
  return {
    pass: failures.length === 0,
    detail:
      failures.join(", ") ||
      "both placement orders and separate tables verified",
  };
}
