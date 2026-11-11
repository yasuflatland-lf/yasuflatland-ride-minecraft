import fc from "fast-check";
import { expect, it } from "vitest";
import { asFurnitureId } from "../../../src/domain/resort/ids";
import { TOILET_SPEC, WASHSTAND_SPEC } from "../../../src/domain/resort/shows";
import { player, showFixture, toilet, washstand } from "./showFixture";

it("forgets unloaded seated toilets on refresh without treating unloading as standing", () => {
  const f = showFixture();
  f.useToilet.execute({ id: toilet, player, now: 0 });
  f.toilets.loadedToilets.mockReturnValue([]);
  f.watch.refresh();
  expect(f.states.toilets.size).toBe(0);
  f.riders.delete(toilet);
  f.toilets.loadedToilets.mockReturnValue([toilet]);
  f.watch.refresh();
  f.ticks.tick(TOILET_SPEC.flushTicks);
  expect(f.toilets.setFlushing).not.toHaveBeenCalled();
  expect(f.toilets.placeBeside).not.toHaveBeenCalled();
  expect(f.sound.playAt).not.toHaveBeenCalled();
  f.useToilet.execute({ id: toilet, player, now: TOILET_SPEC.flushTicks });
  expect(f.toilets.seat).toHaveBeenCalledTimes(2);
});

it("forgets unloaded flushes on either tick or refresh and unloaded runs on tick", () => {
  for (const cleanup of ["tick", "refresh"] as const) {
    const f = showFixture();
    f.useToilet.execute({ id: toilet, player, now: 0 });
    f.riders.delete(toilet);
    f.watch.refresh();
    f.useWashstand.execute({ id: washstand, now: 0 });
    f.toilets.loadedToilets.mockReturnValue([]);
    f.washstands.loadedWashstands.mockReturnValue([]);
    if (cleanup === "refresh") {
      f.watch.refresh();
      expect(f.states.toilets.size).toBe(0);
    }
    const end = Math.max(TOILET_SPEC.flushTicks, WASHSTAND_SPEC.runTicks);
    f.ticks.tick(end);
    expect(f.states.toilets.size).toBe(0);
    expect(f.states.washstands.size).toBe(0);
    f.toilets.loadedToilets.mockReturnValue([toilet]);
    f.washstands.loadedWashstands.mockReturnValue([washstand]);
    f.watch.refresh();
    f.ticks.tick(end);
    expect(f.toilets.setFlushing.mock.calls).toEqual([[toilet, true]]);
    expect(f.toilets.setLid.mock.calls).toEqual([[toilet, true]]);
    expect(f.washstands.setRunning.mock.calls).toEqual([[washstand, true]]);
    f.useToilet.execute({ id: toilet, player, now: end });
    f.useWashstand.execute({ id: washstand, now: end });
    expect(f.toilets.seat).toHaveBeenCalledTimes(2);
    expect(f.washstands.setRunning).toHaveBeenCalledTimes(2);
  }
});

it("ticks every loaded show independently without starting idle shows", () => {
  const f = showFixture();
  const otherToilet = asFurnitureId("other_toilet");
  const otherWashstand = asFurnitureId("other_washstand");
  f.toilets.loadedToilets.mockReturnValue([toilet, otherToilet]);
  f.washstands.loadedWashstands.mockReturnValue([washstand, otherWashstand]);
  f.ticks.tick(0);
  expect(f.toilets.setFlushing).not.toHaveBeenCalled();
  expect(f.toilets.setLid).not.toHaveBeenCalled();
  expect(f.washstands.setRunning).not.toHaveBeenCalled();
  const stagger = TOILET_SPEC.scanTicks;
  for (const [id, now] of [
    [toilet, 0],
    [otherToilet, stagger],
  ] as const) {
    f.useToilet.execute({ id, player, now });
    f.riders.delete(id);
    f.clock.now = now;
    f.watch.refresh();
  }
  f.useWashstand.execute({ id: washstand, now: 0 });
  f.useWashstand.execute({ id: otherWashstand, now: stagger });
  f.ticks.tick(TOILET_SPEC.flushTicks);
  expect(f.toilets.setFlushing).toHaveBeenLastCalledWith(toilet, false);
  expect(f.states.toilets.get(otherToilet)?.phase).toBe("flushing");
  f.ticks.tick(WASHSTAND_SPEC.runTicks);
  expect(f.washstands.setRunning).toHaveBeenLastCalledWith(washstand, false);
  expect(f.states.washstands.get(otherWashstand)?.phase).toBe("running");
  f.ticks.tick(
    Math.max(TOILET_SPEC.flushTicks, WASHSTAND_SPEC.runTicks) + stagger,
  );
  expect(f.toilets.setFlushing).toHaveBeenLastCalledWith(otherToilet, false);
  expect(f.washstands.setRunning).toHaveBeenLastCalledWith(
    otherWashstand,
    false,
  );
});

it("always alternates flush start and end for continuously loaded toilets", () => {
  fc.assert(
    fc.property(
      fc.array(
        fc.record({
          action: fc.constantFrom("interact", "stand", "scan", "tick"),
          advance: fc.nat({ max: TOILET_SPEC.flushTicks * 2 }),
        }),
        { minLength: 1, maxLength: 100 },
      ),
      (steps) => {
        const f = showFixture();
        f.useToilet.execute({ id: toilet, player, now: 0 });
        f.riders.delete(toilet);
        f.watch.refresh();
        for (const step of steps) {
          f.clock.now += step.advance;
          switch (step.action) {
            case "interact":
              f.useToilet.execute({ id: toilet, player, now: f.clock.now });
              break;
            case "stand":
              f.riders.delete(toilet);
              f.watch.refresh();
              break;
            case "scan":
              f.watch.refresh();
              break;
            case "tick":
              f.ticks.tick(f.clock.now);
              break;
          }
        }
        f.ticks.tick(f.clock.now + TOILET_SPEC.flushTicks);
        const calls = f.toilets.setFlushing.mock.calls;
        expect(calls.length).toBeGreaterThanOrEqual(2);
        expect(calls.length % 2).toBe(0);
        calls.forEach(([id, on], index) => {
          expect(id).toBe(toilet);
          expect(on).toBe(index % 2 === 0);
        });
      },
    ),
  );
});
