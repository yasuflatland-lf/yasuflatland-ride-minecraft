import { type Entity, system } from "@minecraft/server";
import {
  beachChairClearCells,
  beachChairOrigin,
  beachChairPose,
  beachChairSupportCells,
} from "../../domain/resort/beachChair";
import { BEACH_CHAIR_SPEC } from "../../domain/resort/spec";
import {
  BEACH_CHAIR,
  BEACH_CHAIR_FOLDED,
  BEACH_CHAIR_ITEM,
  TEST_BEACH_CHAIR_FORM,
  TEST_BEACH_CHAIR_HIT,
  TEST_BEACH_CHAIR_PLACE,
} from "../../infrastructure/resort/identifiers";
import { type Arena, wait } from "../arena";
import type { Outcome } from "../outcome";

async function course(a: Arena, mode: "fold" | "empty"): Promise<Outcome> {
  const block = a.at(100, a.gy - 1, 30);
  const pose = beachChairPose(block, 0);
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
    const origin = beachChairOrigin(pose);
    const atOrigin = () =>
      Math.hypot(
        entity.location.x - origin.x,
        entity.location.y - origin.y,
        entity.location.z - origin.z,
      ) <= 0.01;
    if (mode === "empty") {
      if (!atOrigin())
        failures.push("idle chair did not start at its middle-cell origin");
      for (let refresh = 0; refresh < 2; refresh++) {
        await wait(BEACH_CHAIR_SPEC.poseRefreshTicks + 1);
        if (entity.getComponent("minecraft:rideable")?.getRiders().length !== 0)
          failures.push("empty chair acquired a rider");
        if (!atOrigin()) failures.push("idle chair moved during pose refresh");
      }
    }
    await form(entity, "fold");
    await wait(6);
    if (entity.getProperty(BEACH_CHAIR_FOLDED) !== true)
      failures.push("chair did not fold");
    if (!atOrigin()) failures.push("table moved from its pose origin");
    if (
      beachChairClearCells(pose).some((cell) =>
        a.dim.getBlock(cell)?.typeId.startsWith("yasu_ride:"),
      )
    )
      failures.push("folding placed an add-on block");
    const tableLocation = entity.location;
    await form(entity, "fold");
    if (
      entity.getProperty(BEACH_CHAIR_FOLDED) !== true ||
      Math.hypot(
        entity.location.x - tableLocation.x,
        entity.location.y - tableLocation.y,
        entity.location.z - tableLocation.z,
      ) > 0.01
    )
      failures.push("folding a table changed its form or position");
    await form(entity, "unfold");
    if (entity.getProperty(BEACH_CHAIR_FOLDED) !== false)
      failures.push("table did not unfold");
    const chairLocation = entity.location;
    await form(entity, "unfold");
    if (
      entity.getProperty(BEACH_CHAIR_FOLDED) !== false ||
      Math.hypot(
        entity.location.x - chairLocation.x,
        entity.location.y - chairLocation.y,
        entity.location.z - chairLocation.z,
      ) > 0.01
    )
      failures.push("unfolding a chair changed its form or position");
    await form(entity, "fold");
    for (let hit = 0; hit < BEACH_CHAIR_SPEC.hitsToTakeBack; hit++) {
      system.sendScriptEvent(TEST_BEACH_CHAIR_HIT, entity.id);
      await wait(2);
    }
    if (
      entity.isValid ||
      drops().length !== 1 ||
      drops()[0]?.getComponent("minecraft:item")?.itemStack.amount !== 1
    )
      failures.push("table recovery did not drop one item");
    return {
      pass: failures.length === 0,
      detail:
        failures.join(", ") ||
        "fold, middle-cell hold, wrong-form refusals, unfold and table recovery verified",
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

export function beachChairEmptyRefresh(a: Arena): Promise<Outcome> {
  return course(a, "empty");
}
