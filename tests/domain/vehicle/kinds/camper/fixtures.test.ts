import fc from "fast-check";
import { expect, it } from "vitest";
import { Debounce } from "../../../../../src/domain/shared/debounce";
import { CamperFixtures } from "../../../../../src/domain/vehicle/kinds/camper/fixtures";
import { CAMPER_SPEC } from "../../../../../src/domain/vehicle/kinds/camper/spec";
import { SPEC } from "../../../../../src/domain/vehicle/spec";

const swing = CAMPER_SPEC.doorSwingTicks;

it("debounces entry-door taps and emits swing progress until the target is reached", () => {
  fc.assert(
    fc.property(
      fc.array(fc.integer({ min: 0, max: 3 }), { maxLength: 5 * swing }),
      fc.integer({ min: 0, max: swing }),
      fc.option(fc.boolean(), { nil: undefined }),
      (taps, restoredStep, savedOpen) => {
        const restored = { docked: true, door: restoredStep / swing };
        const fixtures = CamperFixtures.restore(restored, true, savedOpen);

        let open = savedOpen ?? restoredStep * 2 >= swing;
        let step = restoredStep;
        let nextTap = 1;
        const ticks = [0, ...taps, ...Array<number>(swing).fill(0)];
        for (const [tick, count] of ticks.entries()) {
          for (let tap = 0; tap < count; tap++) {
            const accepted = tick >= nextTap;
            expect(fixtures.useDockDoor(tick)).toBe(accepted);
            if (!accepted) continue;
            open = !open;
            nextTap = tick + swing;
          }
          const previous = step;
          step = open ? Math.min(step + 1, swing) : Math.max(step - 1, 0);
          const commands = fixtures.doorCommands();
          expect(commands).toEqual(
            tick === 0 || step !== previous
              ? [{ type: "setProperty", name: "door", value: step / swing }]
              : [],
          );
        }
      },
    ),
  );
});

it("records every ceiling-light use and flips only after idle time when reachable", () => {
  fc.assert(
    fc.property(
      fc.array(
        fc.record({
          gap: fc.integer({ min: 1, max: 2 * SPEC.headlightSwitchCooldown }),
          reachable: fc.boolean(),
        }),
      ),
      fc.boolean(),
      (uses, initiallyOn) => {
        const fixtures = CamperFixtures.restore(
          { ceiling_lights: initiallyOn },
          true,
          undefined,
        );
        const cooldown = new Debounce(SPEC.headlightSwitchCooldown);
        let on = initiallyOn;
        let tick = 0;
        for (const { gap, reachable } of uses) {
          tick += gap;
          const flip = cooldown.press(tick) && reachable;
          expect(fixtures.trySwitchCeilingLights(tick, reachable)).toBe(flip);
          if (flip) on = !on;
          expect(fixtures.ceilingLightsOn).toBe(on);
        }
      },
    ),
  );
});
