import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const dir = "packs/yasu_ride_rp/animation_controllers/yasu_ride";

type State = { animations?: unknown };
type Controller = { states: Record<string, State> };

describe("animation controllers", () => {
  // The client rejects an empty `animations` array ("Required child not
  // found") and then drops the whole file, so every controller in it stops.
  it.each(readdirSync(dir).filter((f) => f.endsWith(".ac.json")))(
    "%s leaves a state without animations unset instead of empty",
    (file) => {
      const controllers = JSON.parse(readFileSync(join(dir, file), "utf8"))
        .animation_controllers as Record<string, Controller>;
      for (const controller of Object.values(controllers)) {
        for (const state of Object.values(controller.states)) {
          if ("animations" in state) {
            expect(state.animations).toBeInstanceOf(Array);
            expect((state.animations as unknown[]).length).toBeGreaterThan(0);
          }
        }
      }
    },
  );
});
