import fc from "fast-check";
import { expect, it, vi } from "vitest";
import { systemClock } from "../../../../src/infrastructure/vehicle/bedrock/systemClock";

const state = vi.hoisted(() => ({ currentTick: 0 }));
vi.mock("@minecraft/server", () => ({
  system: {
    get currentTick() {
      return state.currentTick;
    },
  },
}));

it("now() returns system.currentTick at the time of the call", () => {
  fc.assert(
    fc.property(fc.nat(), (tick) => {
      state.currentTick = tick;
      expect(systemClock.now()).toBe(tick);
    }),
  );
});
