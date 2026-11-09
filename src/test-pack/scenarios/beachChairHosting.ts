import { system } from "@minecraft/server";
import { gasLanternLightCells } from "../../domain/camp/gasLantern";
import { DUTCH_OVEN_SPEC } from "../../domain/camp/spec";
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
  TEST_BEACH_CHAIR_FORM,
  TEST_BEACH_CHAIR_HIT,
  TEST_BEACH_CHAIR_PLACE,
  TEST_BEACH_CHAIR_TOP_BLOCK,
} from "../../infrastructure/resort/identifiers";
import { id } from "../../infrastructure/shared/identifiers";
import { type Arena, wait } from "../arena";
import type { Outcome } from "../outcome";

async function course(
  a: Arena,
  kind: "gas_lantern" | "dutch_oven",
  overlap = false,
): Promise<Outcome> {
  const block = a.at(100, a.gy - 1, 30);
  const pose = beachChairPose(block, 0);
  const origin = beachChairOrigin(pose);
  const cells = tableBlockCells(pose);
  const saved = [
    ...beachChairSupportCells(pose),
    ...beachChairClearCells(pose),
    ...beachChairClearCells(pose).map((c) => ({ ...c, y: c.y + 1 })),
  ].map((cell) => ({ cell, permutation: a.dim.getBlock(cell)?.permutation }));
  const near = (type: string) =>
    a.dim.getEntities({ type, location: origin, maxDistance: 3 });
  const items = () => near(id(kind));
  const failures: string[] = [];
  let chairId = "";
  const place = async (z = -8) => {
    system.sendScriptEvent(
      id(`test_${kind}_on_top`),
      `beach_chair ${chairId} 0 ${z}`,
    );
    await wait(2);
  };
  const form = async (operation: "fold" | "unfold") => {
    system.sendScriptEvent(TEST_BEACH_CHAIR_FORM, `${operation} ${chairId}`);
    await wait(2);
  };
  try {
    for (const { cell } of saved)
      a.dim.getBlock(cell)?.setType("minecraft:air");
    for (const cell of beachChairSupportCells(pose))
      a.dim.getBlock(cell)?.setType("minecraft:stone");
    system.sendScriptEvent(
      TEST_BEACH_CHAIR_PLACE,
      `${block.x} ${block.y} ${block.z} 0`,
    );
    await wait(2);
    const chair = near(BEACH_CHAIR)[0];
    if (!chair) return { pass: false, detail: "chair not placed" };
    chairId = chair.id;
    await place();
    if (items().length) failures.push("chair form accepted hosted item");
    await form("fold");
    if (overlap) {
      // A centered footprint spans both tabletop cells, even though its centre lies in only one.
      for (const cell of cells) {
        const above = { ...cell, y: cell.y + 1 };
        a.dim.getBlock(above)?.setType("minecraft:stone");
        await place(0);
        if (items().length) failures.push("block overlapped hosted footprint");
        a.dim.getBlock(above)?.setType("minecraft:air");
      }
    }
    await place();
    const item = items()[0];
    if (
      !item ||
      Math.abs(item.location.y - origin.y - BEACH_CHAIR_SPEC.topPx / 16) > 0.01
    )
      failures.push("item not on tabletop");
    const lightCells =
      item && kind === "gas_lantern"
        ? gasLanternLightCells(true, item.location)
        : [];
    if (overlap) {
      for (const cell of cells) {
        const above = { ...cell, y: cell.y + 1 };
        system.sendScriptEvent(
          TEST_BEACH_CHAIR_TOP_BLOCK,
          `${above.x} ${above.y} ${above.z}`,
        );
        await wait(2);
        const occupied = cell.z < origin.z;
        if ((a.dim.getBlock(above)?.typeId === "minecraft:stone") === occupied)
          failures.push("block placement ignored hosted footprint");
        if (!occupied) a.dim.getBlock(above)?.setType("minecraft:air");
      }
    }
    if (kind === "gas_lantern" && item) {
      system.sendScriptEvent(id("test_gas_lantern"), item.id);
      await wait(2);
      if (lightCells.some((cell) => a.dim.getBlock(cell)?.isAir !== false))
        failures.push("hosted lantern did not light");
    }
    if (overlap) {
      await place();
      if (items().length !== 1) failures.push("hosted items overlapped");
    }
    await form("unfold");
    if (chair.getProperty(BEACH_CHAIR_FOLDED) !== true)
      failures.push("loaded table unfolded");
    for (let hit = 0; hit < BEACH_CHAIR_SPEC.hitsToTakeBack; hit++) {
      system.sendScriptEvent(TEST_BEACH_CHAIR_HIT, chairId);
      await wait(2);
    }
    if (!chair.isValid) failures.push("loaded table recovered");
    chair.remove();
    await wait(DUTCH_OVEN_SPEC.hostCheckTicks + 2);
    if (items().length) failures.push("orphan hosted item survived");
    if (lightCells.some((cell) => a.dim.getBlock(cell)?.isAir !== true))
      failures.push("orphan lantern light survived");
    if (near("minecraft:item").length) failures.push("host loss dropped items");
    return {
      pass: failures.length === 0,
      detail:
        failures.join(", ") ||
        `${kind}: form, hosting, occupancy and host cleanup verified`,
    };
  } finally {
    for (const type of [BEACH_CHAIR, id(kind), "minecraft:item"])
      for (const entity of near(type)) entity.remove();
    await wait(2);
    for (const { cell, permutation } of saved)
      if (permutation) a.dim.getBlock(cell)?.setPermutation(permutation);
  }
}
export function beachChairLantern(a: Arena): Promise<Outcome> {
  return course(a, "gas_lantern");
}
export function beachChairOven(a: Arena): Promise<Outcome> {
  return course(a, "dutch_oven");
}
export function beachChairTopOverlap(a: Arena): Promise<Outcome> {
  return course(a, "gas_lantern", true);
}
