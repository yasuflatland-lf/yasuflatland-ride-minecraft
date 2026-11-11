import fc from "fast-check";
import { expect, it } from "vitest";
import { TOILET_SPEC } from "../../../src/domain/resort/shows";
import { asPlayerId } from "../../../src/domain/shared/ids";
import { player, showFixture, toilet } from "./showFixture";

it("seats, opens the lid, flushes once on standing and closes at the deadline", () => {
  fc.assert(
    fc.property(fc.nat({ max: 10000 }), fc.nat({ max: 10000 }), (sit, stay) => {
      const f = showFixture();
      f.useToilet.execute({ id: toilet, player, now: sit });
      expect(f.toilets.seat).toHaveBeenCalledExactlyOnceWith(toilet, player);
      expect(f.toilets.setLid).toHaveBeenCalledExactlyOnceWith(toilet, true);
      expect(f.toilets.seat.mock.invocationCallOrder[0]).toBeLessThan(
        f.toilets.setLid.mock.invocationCallOrder[0] ?? 0,
      );
      f.watch.refresh();
      expect(f.toilets.setFlushing).not.toHaveBeenCalled();
      f.clock.now = sit + stay;
      f.riders.delete(toilet);
      f.watch.refresh();
      f.watch.refresh();
      expect(f.toilets.setFlushing).toHaveBeenCalledExactlyOnceWith(
        toilet,
        true,
      );
      expect(f.sound.playAt).toHaveBeenCalledExactlyOnceWith(
        TOILET_SPEC.flushSound,
        toilet,
      );
      expect(f.toilets.placeBeside).toHaveBeenCalledExactlyOnceWith(
        toilet,
        player,
      );
      expect(f.toilets.setFlushing.mock.invocationCallOrder[0]).toBeLessThan(
        f.sound.playAt.mock.invocationCallOrder[0] ?? 0,
      );
      expect(f.sound.playAt.mock.invocationCallOrder[0]).toBeLessThan(
        f.toilets.placeBeside.mock.invocationCallOrder[0] ?? 0,
      );
      const end = f.clock.now + TOILET_SPEC.flushTicks;
      f.ticks.tick(end - 1);
      expect(f.toilets.setFlushing).toHaveBeenCalledTimes(1);
      expect(f.toilets.setLid).toHaveBeenCalledTimes(1);
      f.ticks.tick(end);
      f.ticks.tick(end + 1);
      expect(f.toilets.setFlushing.mock.calls).toEqual([
        [toilet, true],
        [toilet, false],
      ]);
      expect(f.toilets.setLid.mock.calls).toEqual([
        [toilet, true],
        [toilet, false],
      ]);
      expect(f.toilets.setFlushing.mock.invocationCallOrder[1]).toBeLessThan(
        f.toilets.setLid.mock.invocationCallOrder[1] ?? 0,
      );
      f.useToilet.execute({ id: toilet, player, now: end });
      expect(f.toilets.seat).toHaveBeenCalledTimes(2);
    }),
  );
});

it("refuses the same or a second player while occupied and any interact during flushing", () => {
  const f = showFixture();
  f.useToilet.execute({ id: toilet, player, now: 0 });
  const seated = f.states.toilets.get(toilet);
  for (const visitor of [player, asPlayerId("other")]) {
    f.useToilet.execute({ id: toilet, player: visitor, now: 0 });
    expect(f.toilets.showRefused).toHaveBeenLastCalledWith(visitor, "occupied");
    expect(f.states.toilets.get(toilet)).toBe(seated);
  }
  f.riders.delete(toilet);
  f.watch.refresh();
  const flushing = f.states.toilets.get(toilet);
  for (const visitor of [player, asPlayerId("other")]) {
    f.useToilet.execute({
      id: toilet,
      player: visitor,
      now: TOILET_SPEC.flushTicks,
    });
    expect(f.toilets.showRefused).toHaveBeenLastCalledWith(visitor, "flushing");
    expect(f.states.toilets.get(toilet)).toBe(flushing);
  }
  expect(f.toilets.seat).toHaveBeenCalledTimes(1);
  expect(f.toilets.setLid).toHaveBeenCalledTimes(1);
  expect(f.sound.playAt).toHaveBeenCalledTimes(1);
});

it("leaves absent or existing empty state unchanged when seating fails and allows retry", () => {
  for (const initialized of [false, true]) {
    const f = showFixture();
    if (initialized) f.ticks.tick(0);
    const before = f.states.toilets.get(toilet);
    f.toilets.seat.mockReturnValueOnce(false);
    f.useToilet.execute({ id: toilet, player, now: 0 });
    expect(f.states.toilets.get(toilet)).toBe(before);
    f.watch.refresh();
    expect(f.states.toilets.get(toilet)).toBe(before);
    expect(f.toilets.setLid).not.toHaveBeenCalled();
    expect(f.toilets.setFlushing).not.toHaveBeenCalled();
    expect(f.toilets.placeBeside).not.toHaveBeenCalled();
    expect(f.sound.playAt).not.toHaveBeenCalled();
    f.useToilet.execute({ id: toilet, player, now: 0 });
    f.riders.delete(toilet);
    f.watch.refresh();
    expect(f.toilets.setFlushing).toHaveBeenCalledExactlyOnceWith(toilet, true);
  }
});

it("restores an existing rider through the scan without reseating", () => {
  const f = showFixture();
  f.riders.set(toilet, player);
  f.watch.refresh();
  f.useToilet.execute({ id: toilet, player: asPlayerId("other"), now: 0 });
  expect(f.toilets.showRefused).toHaveBeenCalledWith(
    asPlayerId("other"),
    "occupied",
  );
  f.riders.delete(toilet);
  f.watch.refresh();
  expect(f.toilets.seat).not.toHaveBeenCalled();
  expect(f.toilets.setFlushing).toHaveBeenCalledExactlyOnceWith(toilet, true);
});
