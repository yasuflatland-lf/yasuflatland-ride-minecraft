import fc from "fast-check";
import { expect, it, vi } from "vitest";
import { LieOnBeachChair } from "../../../src/application/resort/lieOnBeachChair";
import { asBeachChairId } from "../../../src/domain/resort/ids";
import { asPlayerId, type PlayerId } from "../../../src/domain/shared/ids";

const id = asBeachChairId("chair");
const player = asPlayerId("player");
function fixture() {
  const world = {
    state: vi.fn(() => ({
      form: "chair" as "chair" | "table",
      occupied: false,
      somethingOnTop: false,
    })),
    riderOf: vi.fn<() => PlayerId | undefined>(() => undefined),
    seat: vi.fn(() => true),
    playLounge: vi.fn(),
    placeBeside: vi.fn(),
    showRefused: vi.fn(),
  };
  return { world, action: new LieOnBeachChair(world) };
}
it("refuses table form and another rider without seating or posing", () => {
  for (const reason of ["wrongForm", "occupied"] as const) {
    const { world, action } = fixture();
    world.state.mockReturnValue({
      form: reason === "wrongForm" ? "table" : "chair",
      occupied: reason === "occupied",
      somethingOnTop: false,
    });
    if (reason === "occupied")
      world.riderOf.mockReturnValue(asPlayerId("other"));
    expect(action.execute({ id, player })).toBe(false);
    expect(world.showRefused).toHaveBeenCalledExactlyOnceWith(player, reason);
    expect(world.seat).not.toHaveBeenCalled();
    expect(world.playLounge).not.toHaveBeenCalled();
  }
});
it("only refreshes while riding and places beside exactly once after dismount", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: 40 }),
      fc.integer({ min: 1, max: 40 }),
      (riding, empty) => {
        const { world, action } = fixture();
        expect(action.execute({ id, player })).toBe(true);
        expect(world.seat).toHaveBeenCalledExactlyOnceWith(id, player);
        world.riderOf.mockReturnValue(player);
        for (let i = 0; i < riding; i++) action.refresh([id]);
        expect(world.playLounge).toHaveBeenCalledTimes(riding + 1);
        expect(world.placeBeside).not.toHaveBeenCalled();
        world.riderOf.mockReturnValue(undefined);
        for (let i = 0; i < empty; i++) action.refresh([id]);
        expect(world.playLounge).toHaveBeenCalledTimes(riding + 1);
        expect(world.placeBeside).toHaveBeenCalledExactlyOnceWith(id, player);
      },
    ),
  );
});
it("tracks immediate dismount before the first refresh", () => {
  const { world, action } = fixture();
  action.execute({ id, player });
  action.refresh([id]);
  action.refresh([id]);
  expect(world.placeBeside).toHaveBeenCalledExactlyOnceWith(id, player);
});
it("restores an existing rider without reseating and forgets unloaded chairs", () => {
  const { world, action } = fixture();
  world.riderOf.mockReturnValue(player);
  action.refresh([id]);
  expect(world.playLounge).toHaveBeenCalledExactlyOnceWith(player);
  expect(world.seat).not.toHaveBeenCalled();
  action.refresh([]);
  world.riderOf.mockReturnValue(undefined);
  action.refresh([id]);
  expect(world.placeBeside).not.toHaveBeenCalled();
});
it("does not pose after failed seating or reseat the same rider", () => {
  const { world, action } = fixture();
  world.seat.mockReturnValue(false);
  expect(action.execute({ id, player })).toBe(false);
  action.refresh([id]);
  expect(world.playLounge).not.toHaveBeenCalled();
  expect(world.placeBeside).not.toHaveBeenCalled();
  world.riderOf.mockReturnValue(player);
  expect(action.execute({ id, player })).toBe(true);
  expect(world.seat).toHaveBeenCalledTimes(1);
});
