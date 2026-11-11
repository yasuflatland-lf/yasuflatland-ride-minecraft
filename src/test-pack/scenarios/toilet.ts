import { system } from "@minecraft/server";
import { TOILET_SPEC } from "../../domain/resort/shows";
import {
  TEST_TOILET,
  TOILET_FLUSHING,
  TOILET_LID_OPEN,
} from "../../infrastructure/resort/identifiers";
import { type Arena, wait } from "../arena";
import type { Outcome } from "../outcome";
import {
  furniturePlaceTakeBack,
  SHOW_SETTLE_TICKS,
  withPlacedFurniture,
} from "./sofaSingle";

export function toiletPlaceTakeBack(a: Arena): Promise<Outcome> {
  return furniturePlaceTakeBack(a, "toilet");
}

export function toiletFlushTiming(a: Arena): Promise<Outcome> {
  return withPlacedFurniture(a, "toilet", async (entity) => {
    const lidOpen = () => entity.getProperty(TOILET_LID_OPEN) === true;
    const flushing = () => entity.getProperty(TOILET_FLUSHING) === true;
    system.sendScriptEvent(TEST_TOILET, `${entity.id} sit`);
    await wait(SHOW_SETTLE_TICKS);
    if (!lidOpen() || flushing())
      return { pass: false, detail: "sit must open the lid without flushing" };
    system.sendScriptEvent(TEST_TOILET, `${entity.id} dismount`);
    await wait(SHOW_SETTLE_TICKS);
    if (!flushing() || !lidOpen())
      return { pass: false, detail: "dismount must flush with the lid open" };

    const started = system.currentTick;
    let retried = false;
    while (system.currentTick - started < TOILET_SPEC.flushTicks) {
      const elapsed = system.currentTick - started;
      if (!retried && elapsed >= TOILET_SPEC.flushTicks / 2) {
        // The hook has one fixed player id; flushing must refuse even that rider.
        system.sendScriptEvent(TEST_TOILET, `${entity.id} sit`);
        retried = true;
      }
      if (elapsed < TOILET_SPEC.flushTicks - SHOW_SETTLE_TICKS && !flushing())
        return {
          pass: false,
          detail: `flush stopped early at tick ${elapsed}`,
        };
      if (flushing() && !lidOpen())
        return {
          pass: false,
          detail: `lid closed during flush at tick ${elapsed}`,
        };
      await wait(1);
    }
    return {
      pass: !flushing() && !lidOpen(),
      detail:
        "flush must end and close the lid at the first deadline despite another sit",
    };
  });
}
