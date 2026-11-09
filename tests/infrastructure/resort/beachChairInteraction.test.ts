import { beforeEach, expect, it, vi } from "vitest";
import { BeachChairMenu } from "../../../src/application/resort/beachChairMenu";
import { SwitchBeachChairForm } from "../../../src/application/resort/switchBeachChairForm";
import { BedrockBeachChairWorld } from "../../../src/infrastructure/resort/bedrock/bedrockBeachChairWorld";
import { registerBeachChairInteraction } from "../../../src/infrastructure/resort/bedrock/handlers/beachChairInteraction";
import {
  BEACH_CHAIR,
  BEACH_CHAIR_TOP,
} from "../../../src/infrastructure/resort/identifiers";
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
  BlockTypes: {
    get: (type: string) => (type === "minecraft:stone" ? {} : undefined),
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
  const owner = vi
    .spyOn(BedrockBeachChairWorld.prototype, "topOwner")
    .mockReturnValue("chair");
  registerBeachChairInteraction(
    new BedrockBeachChairWorld({
      isVehicleSpace: () => false,
      isCampSpace: () => false,
    }),
    form,
    menu,
  );
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
    owner,
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
it("leaves blocks and future hosted items to their placement handlers and unfolds for other items", () => {
  const f = fixture();
  let interact: ((ev: unknown) => void) | undefined;
  game.callbacks.get("startup")?.({
    blockComponentRegistry: {
      registerCustomComponent: (
        id: string,
        component: { onPlayerInteract: (ev: unknown) => void },
      ) => {
        expect(id).toBe(BEACH_CHAIR_TOP);
        interact = component.onPlayerInteract;
      },
    },
  });
  const ev = {
    player: f.player,
    dimension: { id: "overworld" },
    block: { typeId: BEACH_CHAIR_TOP, location: { x: 0, y: 64, z: 0 } },
  };
  for (const type of [
    "minecraft:stone",
    "yasu_ride:gas_lantern_item",
    "yasu_ride:dutch_oven_item",
  ]) {
    f.hold(type);
    interact?.(ev);
  }
  expect(f.unfold).not.toHaveBeenCalled();
  for (const type of [undefined, "minecraft:stick", "minecraft:red_dye"]) {
    f.hold(type);
    game.tick++;
    interact?.(ev);
    interact?.(ev);
  }
  expect(f.unfold).toHaveBeenCalledTimes(3);
  f.owner.mockReturnValue(undefined);
  game.tick++;
  interact?.(ev);
  expect(f.unfold).toHaveBeenCalledTimes(3);
});
