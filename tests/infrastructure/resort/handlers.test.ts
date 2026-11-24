import { cellOf } from "../../../src/domain/shared/cells";

vi.mock("../../../src/infrastructure/shared/choiceForm", () => ({
  chooseFromFormResult: vi.fn(),
}));

import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlaceBeachChair } from "../../../src/application/resort/placeBeachChair";
import { PlaceFurniture } from "../../../src/application/resort/placeFurniture";
import { PlaceParasol } from "../../../src/application/resort/placeParasol";
import { SyncParasolCeilings } from "../../../src/application/resort/syncParasolCeilings";
import { TakeBackBeachChair } from "../../../src/application/resort/takeBackBeachChair";
import { TakeBackFurniture } from "../../../src/application/resort/takeBackFurniture";
import { TakeBackParasol } from "../../../src/application/resort/takeBackParasol";
import type { FurnitureKind } from "../../../src/domain/resort/furniture";
import { asFurnitureId, asParasolId } from "../../../src/domain/resort/ids";
import { PARASOL_SPEC } from "../../../src/domain/resort/spec";
import { BedrockParasolWorld } from "../../../src/infrastructure/resort/bedrock/bedrockParasolWorld";
import { registerBeachChairHits } from "../../../src/infrastructure/resort/bedrock/handlers/beachChairHits";
import { registerBeachChairPlacement } from "../../../src/infrastructure/resort/bedrock/handlers/beachChairPlacement";
import { registerFurnitureHits } from "../../../src/infrastructure/resort/bedrock/handlers/furnitureHits";
import { registerFurniturePlacement } from "../../../src/infrastructure/resort/bedrock/handlers/furniturePlacement";
import {
  BEACH_CHAIR,
  BEACH_CHAIR_ITEM,
  BEACH_PARASOL,
  BEACH_PARASOL_ITEM,
  DINING_TABLE_TOP,
  FURNITURE_IDS,
  PARASOL_CEILING_BLOCK,
} from "../../../src/infrastructure/resort/identifiers";
import { installResort } from "../../../src/infrastructure/resort/install";
import { fakeBeachChairWorld } from "../../application/resort/fakeBeachChairWorld";
import { fakeFurnitureWorld } from "../../application/resort/fakeFurnitureWorld";
import { campTopHosts } from "../../support/campTopHosts";

import { resortHandlerGame } from "../../support/resortHandlerMocks";

vi.mock("@minecraft/server", async () =>
  (await import("../../support/resortHandlerMocks")).bedrockResortHandlers(),
);
vi.mock("../../../src/infrastructure/shared/dyes", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../../src/infrastructure/shared/dyes")
  >()),
  heldDye: () => (game.dye ? "red" : undefined),
}));

const game = resortHandlerGame();

beforeEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
  game.handlers.clear();
  game.tick = 10;
  game.dye = false;
});

function setupParasol() {
  const deps = {
    topHosts: campTopHosts(),
    isVehicleSpace: vi.fn(() => true),
    isCampSpace: vi.fn(() => false),
    placeHostedOnTop: vi.fn(() => false),
  };
  installResort(deps);
  return deps;
}

const handlerCases = [
  {
    name: "beach chair",
    item: BEACH_CHAIR_ITEM,
    entity: BEACH_CHAIR,
    placementFields: {},
    hitTime: { tick: 10 },
    setup: () => {
      const world = fakeBeachChairWorld();
      const place = new PlaceBeachChair(world);
      const recover = new TakeBackBeachChair(world);
      registerBeachChairPlacement(place);
      registerBeachChairHits(recover);
      return {
        place: vi.spyOn(place, "execute").mockReturnValue(true),
        recover: vi.spyOn(recover, "execute").mockImplementation(() => {}),
      };
    },
  },
  {
    name: "parasol",
    item: BEACH_PARASOL_ITEM,
    entity: BEACH_PARASOL,
    placementFields: {},
    hitTime: { tick: 10 },
    setup: () => {
      setupParasol();
      return {
        place: vi
          .spyOn(PlaceParasol.prototype, "execute")
          .mockReturnValue(true),
        recover: vi
          .spyOn(TakeBackParasol.prototype, "execute")
          .mockImplementation(() => {}),
      };
    },
  },
  ...(Object.keys(FURNITURE_IDS) as FurnitureKind[]).map((kind) => ({
    name: kind,
    item: FURNITURE_IDS[kind].item,
    entity: FURNITURE_IDS[kind].entity,
    placementFields: { kind },
    hitTime: { now: 10 },
    setup: () => {
      const world = fakeFurnitureWorld(kind);
      const place = new PlaceFurniture(world);
      const recover = new TakeBackFurniture(world);
      registerFurniturePlacement(place);
      registerFurnitureHits(recover, { ownerAt: () => undefined });
      return {
        place: vi.spyOn(place, "execute").mockReturnValue(true),
        recover: vi.spyOn(recover, "hit").mockImplementation(() => {}),
      };
    },
  })),
];

describe.each(handlerCases)(
  "$name handlers",
  ({ item, entity, placementFields, hitTime, setup }) => {
    it.each([
      ["Up", "up"],
      ["North", "north"],
    ])(
      "cancels a %s press and defers one placement with the captured command",
      (blockFace, face) => {
        const { place } = setup();
        const press = game.handlers.get("playerInteractWithBlock");
        const ev = {
          isFirstEvent: true,
          itemStack: { typeId: item },
          player: new game.Player(),
          block: {
            dimension: { id: "overworld" },
            location: { x: 1, y: 2, z: 3 },
          },
          blockFace,
          cancel: false,
        };
        press?.({ ...ev, isFirstEvent: false });
        press?.({ ...ev, itemStack: { typeId: "other" } });
        expect(game.run).not.toHaveBeenCalled();
        press?.(ev);
        const duplicate = { ...ev, cancel: false };
        press?.(duplicate);
        expect(duplicate.cancel).toBe(true);
        expect(ev.cancel).toBe(true);
        expect(place).not.toHaveBeenCalled();
        expect(game.run).toHaveBeenCalledOnce();
        ev.block.location.x = 99;
        game.run.mock.calls[0]?.[0]();
        expect(place).toHaveBeenCalledExactlyOnceWith({
          player: "p",
          dimension: "overworld",
          block: { x: 1, y: 2, z: 3 },
          face,
          yaw: 90,
          slot: 2,
          ...placementFields,
        });
        game.tick++;
        press?.(ev);
        expect(game.run).toHaveBeenCalledTimes(2);
      },
    );

    it("recovers only matching entities hit by a player, once per tick", () => {
      const { recover } = setup();
      const hit = game.handlers.get("entityHitEntity");
      const ev = {
        damagingEntity: new game.Player(),
        hitEntity: { id: "furniture", typeId: entity },
      };
      hit?.({ ...ev, hitEntity: { typeId: "other" } });
      hit?.({ ...ev, damagingEntity: { id: "mob" } });
      expect(recover).not.toHaveBeenCalled();
      expect(game.run).not.toHaveBeenCalled();
      const strike = (call: number) => {
        hit?.(ev);
        hit?.(ev);
        expect(recover).toHaveBeenCalledTimes(call - 1);
        expect(game.run).toHaveBeenCalledTimes(call);
        game.run.mock.calls[call - 1]?.[0]();
        expect(recover).toHaveBeenCalledTimes(call);
      };
      strike(1);
      expect(recover).toHaveBeenCalledWith({
        id: "furniture",
        player: "p",
        ...hitTime,
      });
      game.tick++;
      strike(2);
    });

    it("leaves recovery available after a dye hit in the same tick", () => {
      const { recover } = setup();
      const hit = game.handlers.get("entityHitEntity");
      const ev = {
        damagingEntity: new game.Player(),
        hitEntity: { id: "furniture", typeId: entity },
      };
      game.dye = true;
      hit?.(ev);
      if (entity !== BEACH_PARASOL) expect(game.run).not.toHaveBeenCalled();
      game.dye = false;
      hit?.(ev);
      hit?.(ev);
      expect(recover).not.toHaveBeenCalled();
      for (const [run] of game.run.mock.calls) run();
      expect(recover).toHaveBeenCalledExactlyOnceWith({
        id: "furniture",
        player: "p",
        ...hitTime,
      });
    });
  },
);

it("forwards owned block hits and Creative breaks with shared deduplication and dye exclusion", () => {
  const world = fakeFurnitureWorld("dining_table");
  const take = new TakeBackFurniture(world);
  const hit = vi.spyOn(take, "hit").mockImplementation(() => {});
  const ownerAt = vi.fn(
    () =>
      asFurnitureId("table") as ReturnType<
        import("../../../src/application/resort/ports/furnitureTopBlocks").FurnitureTopBlocksWorld["ownerAt"]
      >,
  );
  registerFurnitureHits(take, { ownerAt });
  const player = new game.Player();
  const block = {
    typeId: DINING_TABLE_TOP,
    dimension: { id: "overworld" },
    location: { x: 1, y: 2, z: 3 },
  };
  const swing = () =>
    game.handlers.get("entityHitBlock")?.({
      damagingEntity: player,
      hitBlock: block,
    });
  const breakEvent = {
    player,
    block,
    dimension: block.dimension,
    cancel: false,
  };
  const breaking = () => game.handlers.get("playerBreakBlock")?.(breakEvent);
  game.dye = true;
  swing();
  breaking();
  expect(game.run).not.toHaveBeenCalled();
  game.dye = false;
  ownerAt.mockReturnValue(undefined);
  swing();
  breaking();
  expect(game.run).not.toHaveBeenCalled();
  ownerAt.mockReturnValue(asFurnitureId("table"));
  swing();
  breaking();
  game.handlers.get("entityHitEntity")?.({
    damagingEntity: player,
    hitEntity: { typeId: FURNITURE_IDS.dining_table.entity, id: "table" },
  });
  expect(game.run).toHaveBeenCalledTimes(1);
  expect(hit).not.toHaveBeenCalled();
  game.run.mock.calls[0]?.[0]();
  expect(hit).toHaveBeenCalledWith({ player: "p", id: "table", now: 10 });
  expect(breakEvent.cancel).toBe(false);
  game.tick++;
  breaking();
  expect(game.run).toHaveBeenCalledTimes(2);
  game.tick++;
  vi.spyOn(player, "getGameMode").mockReturnValue("Survival");
  breaking();
  expect(game.run).toHaveBeenCalledTimes(2);
  block.typeId = "minecraft:stone";
  swing();
  expect(game.run).toHaveBeenCalledTimes(2);
});

it("wires the scan interval, shared block guard and both space checks", () => {
  const sync = vi
    .spyOn(SyncParasolCeilings.prototype, "execute")
    .mockImplementation(() => {});
  const owner = vi
    .spyOn(BedrockParasolWorld.prototype, "ceilingOwner")
    .mockReturnValue("p");
  const deps = setupParasol();
  expect(game.runInterval).toHaveBeenCalledTimes(5);
  expect(game.handlers.has("startup")).toBe(false);
  const loaded = { id: "p" };
  game.getDimension.mockReturnValue({ getEntities: () => [loaded] });
  expect(game.runInterval).toHaveBeenCalledWith(
    expect.any(Function),
    PARASOL_SPEC.ceilingSyncTicks,
  );
  game.runInterval.mock.lastCall?.[0]();
  expect(sync).toHaveBeenCalledWith(["p", "p", "p"]);
  const ev = {
    dimension: { id: "overworld" },
    block: { location: { x: 0, y: 5, z: 0 }, typeId: PARASOL_CEILING_BLOCK },
    cancel: false,
  };
  game.handlers.get("playerBreakBlock")?.(ev);
  expect(ev.cancel).toBe(true);
  expect(owner).toHaveBeenCalled();
  const adapter = owner.mock.instances[0] as BedrockParasolWorld | undefined;
  expect(
    adapter?.isVehicleSpace("overworld" as never, cellOf(ev.block.location)),
  ).toBe(true);
  expect(
    adapter?.isCampSpace("overworld" as never, cellOf(ev.block.location)),
  ).toBe(false);
  expect(deps.isCampSpace).toHaveBeenCalled();
});
it("clears confirmed removals but preserves unloaded chunks and still-loaded entities", () => {
  const remember = vi
    .spyOn(BedrockParasolWorld.prototype, "remember")
    .mockImplementation(() => {});
  const clear = vi
    .spyOn(BedrockParasolWorld.prototype, "clearCeiling")
    .mockReturnValue(true);
  setupParasol();
  const dimension = { getBlock: vi.fn() };
  const entity = {
    id: "p",
    typeId: BEACH_PARASOL,
    dimension,
    location: { x: 1, y: 2, z: 3 },
  };
  const remove = game.handlers.get("entityRemove");
  for (const state of ["unloaded", "throw", "present", "gone"]) {
    game.getEntity.mockReturnValue(
      state === "present" ? { ...entity, isValid: true } : undefined,
    );
    dimension.getBlock.mockImplementation(() => {
      if (state === "throw") throw Error("unloaded");
      return state === "unloaded" ? undefined : {};
    });
    remove?.({ removedEntity: entity });
    expect(remember).toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
    game.run.mock.lastCall?.[0]();
    if (state !== "gone") expect(clear).not.toHaveBeenCalled();
  }
  expect(clear).toHaveBeenCalledExactlyOnceWith(asParasolId("p"));
});
