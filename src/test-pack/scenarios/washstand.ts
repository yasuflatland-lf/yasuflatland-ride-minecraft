import { system } from "@minecraft/server";
import { WASHSTAND_SPEC } from "../../domain/resort/shows";
import {
  TEST_WASHSTAND,
  WASHSTAND_RUNNING,
} from "../../infrastructure/resort/identifiers";
import { type Arena, wait } from "../arena";
import type { Outcome } from "../outcome";
import {
  furniturePlaceTakeBack,
  SHOW_SETTLE_TICKS,
  withPlacedFurniture,
} from "./sofaSingle";

export function washstandPlaceTakeBack(a: Arena): Promise<Outcome> {
  return furniturePlaceTakeBack(a, "washstand");
}

export function washstandRunTiming(a: Arena): Promise<Outcome> {
  return withPlacedFurniture(a, "washstand", async (entity) => {
    const running = () => entity.getProperty(WASHSTAND_RUNNING) === true;
    system.sendScriptEvent(TEST_WASHSTAND, `${entity.id} run`);
    await wait(SHOW_SETTLE_TICKS);
    if (!running()) return { pass: false, detail: "run must start the water" };

    const started = system.currentTick;
    let retried = false;
    while (system.currentTick - started < WASHSTAND_SPEC.runTicks) {
      const elapsed = system.currentTick - started;
      if (!retried && elapsed >= WASHSTAND_SPEC.runTicks / 2) {
        system.sendScriptEvent(TEST_WASHSTAND, `${entity.id} run`);
        retried = true;
      }
      if (elapsed < WASHSTAND_SPEC.runTicks - SHOW_SETTLE_TICKS && !running())
        return {
          pass: false,
          detail: `water stopped early at tick ${elapsed}`,
        };
      await wait(1);
    }
    return {
      pass: !running(),
      detail: "water must stop at the first deadline despite another run",
    };
  });
}
