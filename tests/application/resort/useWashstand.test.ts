import fc from "fast-check";
import { expect, it } from "vitest";
import { WASHSTAND_SPEC } from "../../../src/domain/resort/shows";
import { showFixture, washstand } from "./showFixture";

it("starts once, ignores repeated interactions and ends without extending the deadline", () => {
  fc.assert(
    fc.property(
      fc.nat({ max: 10000 }),
      fc.nat({ max: WASHSTAND_SPEC.runTicks * 2 }),
      (now, delay) => {
        const f = showFixture();
        f.useWashstand.execute({ id: washstand, now });
        const running = f.states.washstands.get(washstand);
        f.useWashstand.execute({ id: washstand, now: now + delay });
        expect(f.states.washstands.get(washstand)).toBe(running);
        expect(f.washstands.setRunning).toHaveBeenCalledExactlyOnceWith(
          washstand,
          true,
        );
        expect(f.sound.playAt).toHaveBeenCalledExactlyOnceWith(
          WASHSTAND_SPEC.runSound,
          washstand,
        );
        expect(
          f.washstands.setRunning.mock.invocationCallOrder[0],
        ).toBeLessThan(f.sound.playAt.mock.invocationCallOrder[0] ?? 0);
        const end = now + WASHSTAND_SPEC.runTicks;
        if (now + delay < end) {
          f.ticks.tick(end - 1);
          expect(f.washstands.setRunning).toHaveBeenCalledTimes(1);
        }
        f.ticks.tick(Math.max(end, now + delay));
        f.ticks.tick(Math.max(end, now + delay) + 1);
        expect(f.washstands.setRunning.mock.calls).toEqual([
          [washstand, true],
          [washstand, false],
        ]);
        f.useWashstand.execute({
          id: washstand,
          now: Math.max(end, now + delay) + 1,
        });
        expect(f.washstands.setRunning).toHaveBeenLastCalledWith(
          washstand,
          true,
        );
        expect(f.sound.playAt).toHaveBeenCalledTimes(2);
      },
    ),
  );
});
