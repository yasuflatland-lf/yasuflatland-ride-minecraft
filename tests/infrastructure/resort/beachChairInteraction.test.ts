import { beforeEach, expect, it, vi } from "vitest";
import { BeachChairMenu } from "../../../src/application/resort/beachChairMenu";
import { SwitchBeachChairForm } from "../../../src/application/resort/switchBeachChairForm";
import { registerBeachChairInteraction } from "../../../src/infrastructure/resort/bedrock/handlers/beachChairInteraction";
import { BEACH_CHAIR } from "../../../src/infrastructure/resort/identifiers";
import { fakeBeachChairWorld } from "../../application/resort/fakeBeachChairWorld";

const game = vi.hoisted(() => {
  const callbacks = new Map<string, (ev: unknown) => void>();
  const events = new Proxy(
    {},
    {
      get: (_, name: string) => ({
        subscribe: (fn: (ev: unknown) => void) => callbacks.set(name, fn),
      }),
    },
  );
  return {
    callbacks,
    events,
    run: vi.fn(),
    choose: vi.fn(),
    tick: 10,
    dye: false,
  };
});
vi.mock("@minecraft/server", () => ({
  world: { beforeEvents: game.events },
  system: {
    beforeEvents: game.events,
    run: game.run,
    get currentTick() {
      return game.tick;
    },
  },
}));
vi.mock("../../../src/infrastructure/shared/dyes", () => ({
  heldDye: () => (game.dye ? "red" : undefined),
}));
vi.mock("../../../src/infrastructure/shared/choiceForm", () => ({
  chooseFromFormResult: game.choose,
}));
beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  game.callbacks.clear();
  game.tick = 10;
  game.dye = false;
});
function fixture() {
  const world = { ...fakeBeachChairWorld(), setForm: vi.fn() };
  const form = new SwitchBeachChairForm(world);
  const menu = new BeachChairMenu(form, vi.fn());
  const choose = vi.spyOn(menu, "choose");
  const unfold = vi.spyOn(form, "unfold");
  registerBeachChairInteraction(form, menu);
  let held: string | undefined;
  const player = {
    id: "p",
    isValid: true,
    selectedSlotIndex: 0,
    getComponent: () => ({
      container: { getItem: () => (held ? { typeId: held } : undefined) },
    }),
  };
  return {
    player,
    choose,
    unfold,
    world,
    hold: (item: string | undefined) => {
      held = item;
    },
  };
}
it("cancels and defers chair presses, ignores dyes and serializes pending forms", async () => {
  const f = fixture();
  const press = game.callbacks.get("playerInteractWithEntity");
  const ev = {
    player: f.player,
    target: { typeId: BEACH_CHAIR, id: "chair", getProperty: () => false },
    cancel: false,
  };
  let answer: (value: unknown) => void = () => {};
  game.choose.mockReturnValue(
    new Promise((resolve) => {
      answer = resolve;
    }),
  );
  game.dye = true;
  press?.(ev);
  expect(ev.cancel).toBe(false);
  game.dye = false;
  press?.(ev);
  press?.(ev);
  expect(ev.cancel).toBe(true);
  expect(game.run).toHaveBeenCalledTimes(1);
  game.run.mock.calls[0]?.[0]();
  game.tick++;
  press?.(ev);
  game.run.mock.calls[1]?.[0]();
  expect(game.choose).toHaveBeenCalledTimes(1);
  expect(game.choose).toHaveBeenCalledWith(
    f.player,
    "yasu_ride.beach_chair.menu.title",
    [
      { id: "lie_down", textKey: "yasu_ride.beach_chair.menu.lie_down" },
      { id: "fold", textKey: "yasu_ride.beach_chair.menu.fold" },
    ],
  );
  answer({ status: "answered", choice: "fold" });
  await vi.waitFor(() =>
    expect(f.choose).toHaveBeenCalledExactlyOnceWith("fold", {
      id: "chair",
      player: "p",
    }),
  );
});
it.each(["cancelled", "busy", "unanswered", "unavailable"])(
  "does not select an option for a %s form",
  async (status) => {
    const f = fixture();
    game.choose.mockResolvedValue({ status });
    game.callbacks.get("playerInteractWithEntity")?.({
      player: f.player,
      target: { typeId: BEACH_CHAIR, id: "chair", getProperty: () => false },
    });
    game.run.mock.calls[0]?.[0]();
    await Promise.resolve();
    await Promise.resolve();
    expect(f.choose).not.toHaveBeenCalled();
  },
);
it.each(["yasu_ride:gas_lantern_item", "yasu_ride:dutch_oven_item"])(
  "leaves folded presses with %s to tabletop hosting",
  (item) => {
    const f = fixture();
    f.hold(item);
    const ev = {
      player: f.player,
      target: { typeId: BEACH_CHAIR, id: "chair", getProperty: () => true },
      cancel: false,
    };
    game.callbacks.get("playerInteractWithEntity")?.(ev);
    expect(ev.cancel).toBe(false);
    expect(game.run).not.toHaveBeenCalled();
  },
);
it.each([undefined, "minecraft:stick", "minecraft:stone"])(
  "cancels folded presses with %s and unfolds without a menu",
  (item) => {
    const f = fixture();
    f.hold(item);
    const ev = {
      player: f.player,
      target: { typeId: BEACH_CHAIR, id: "chair", getProperty: () => true },
      cancel: false,
    };
    const press = game.callbacks.get("playerInteractWithEntity");
    press?.(ev);
    press?.(ev);
    expect(ev.cancel).toBe(true);
    expect(game.run).toHaveBeenCalledTimes(1);
    game.run.mock.calls[0]?.[0]();
    expect(f.unfold).toHaveBeenCalledExactlyOnceWith({
      id: "chair",
      player: "p",
    });
    expect(game.choose).not.toHaveBeenCalled();
  },
);
it("refuses unfolding a table with a hosted item", () => {
  const f = fixture();
  f.world.state.mockReturnValue({
    form: "table",
    occupied: false,
    somethingOnTop: true,
  });
  game.callbacks.get("playerInteractWithEntity")?.({
    player: f.player,
    target: { typeId: BEACH_CHAIR, id: "chair", getProperty: () => true },
  });
  game.run.mock.calls[0]?.[0]();
  expect(f.world.setForm).not.toHaveBeenCalled();
  expect(f.world.showRefused).toHaveBeenCalledWith("p", "somethingOnTop");
});
