import { createHash } from "node:crypto";
import fc from "fast-check";
import { expect, it } from "vitest";
import { CamperFixtures } from "../../../../../src/domain/vehicle/kinds/camper/fixtures";
import { CAMPER_SPEC } from "../../../../../src/domain/vehicle/kinds/camper/spec";

const swing = CAMPER_SPEC.doorSwingTicks;

it("matches the original camper entry-door trace for arbitrary tap schedules", () => {
  const recorded = createHash("sha256");
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
        const trace = ticks.map((count, tick) => {
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
          return commands;
        });
        recorded.update(JSON.stringify(trace));
      },
    ),
    { seed: 2094, numRuns: 100 },
  );
  // Captured from the original CamperDrive with the same generated inputs.
  expect(recorded.digest("hex")).toBe(
    "8fc4a2eedaa9d8bcc9a3d429227ac69a0f857054cd80a1fdaf021a132cc5472b",
  );
});
