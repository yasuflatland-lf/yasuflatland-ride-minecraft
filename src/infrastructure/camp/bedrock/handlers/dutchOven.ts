import {
  type Entity,
  type Player,
  ScriptEventSource,
  system,
  world,
} from "@minecraft/server";
import type { DutchOvenActions } from "../../../../application/camp/dutchOven";
import type { HostedItemsGuard } from "../../../../application/shared/hostedItemsGuard";
import { asDutchOvenId } from "../../../../domain/camp/dutchOven";
import { asFirePitId } from "../../../../domain/camp/firePit";
import { DUTCH_OVEN_SPEC, TABLE_SPOTS } from "../../../../domain/camp/spec";
import { asTableId, type TableId } from "../../../../domain/camp/table";
import { asPlayerId, type PlayerId } from "../../../../domain/shared/ids";
import type { LocalPoint } from "../../../../domain/shared/tableTop";
import { TickScopedSet } from "../../../../domain/shared/tickScoped";
import { heldTypeId } from "../../../shared/heldItem";
import { id } from "../../../shared/identifiers";
import { showTopRefusal, topAim } from "../../../shared/tableTop/aim";
import type { PlaceHostedOnTop } from "../../../shared/tableTop/hosted";
import type { TopHostRegistry } from "../../../shared/tableTop/registry";
import {
  DUTCH_OVEN_ITEM,
  DUTCH_OVEN_SIMMERING_PROPERTY,
  DUTCH_OVEN_TYPE,
  FIRE_PIT_TYPE,
  TEST_DUTCH_OVEN_HIT_EVENT,
  TEST_DUTCH_OVEN_HOST_EVENT,
  TEST_DUTCH_OVEN_ON_PIT_EVENT,
  TEST_DUTCH_OVEN_ON_TABLE_EVENT,
  TEST_DUTCH_OVEN_SIMMER_EVENT,
} from "../../identifiers";
import { setOvenHost } from "../bedrockDutchOvenWorld";
import { testTableTopRequest } from "../tableTopAim";
import { registerPlaceableEntity } from "./placeable";

/** Reads `<table> <0|1>` as an old spot, or `<table> <x> <z>` as local pixels. */
function testTableRequest(
  message: string,
): { table: TableId; aim: LocalPoint } | undefined {
  const [table, spot, ...rest] = message.trim().split(/\s+/);
  if (table && rest.length === 0 && /^[01]$/.test(spot ?? "")) {
    const aim = TABLE_SPOTS[Number(spot)];
    return aim ? { table: asTableId(table), aim } : undefined;
  }
  return testTableTopRequest(message);
}

export function registerDutchOven(
  actions: DutchOvenActions,
  hostedItems: HostedItemsGuard,
  registry: TopHostRegistry,
): PlaceHostedOnTop {
  const placements = new TickScopedSet<PlayerId>();
  const place = (
    placer: Player,
    host: Entity,
    held: string | undefined,
  ): boolean => {
    if (held !== DUTCH_OVEN_ITEM) return false;
    const type = registry.hostTypeOf(host);
    if (!type) return false;
    const player = asPlayerId(placer.id);
    if (!placements.add(system.currentTick, player)) return true;
    const slot = placer.selectedSlotIndex;
    const aim = topAim(placer, host, type.surface);
    const id = host.id;
    system.run(() =>
      showTopRefusal(
        placer,
        type,
        actions.placeOnTop(type.surface, {
          player,
          hostType: type.hostType,
          host: id,
          slot,
          aim,
        }),
      ),
    );
    return true;
  };
  registerPlaceableEntity({
    itemId: DUTCH_OVEN_ITEM,
    entityTypeIds: new Set([DUTCH_OVEN_TYPE]),
    canUseBlock: (dimension, block, face) =>
      actions.canUseBlock(dimension, block, face),
    place: (ctx) => actions.place(ctx),
    hit: ({ entity, player, tick }) =>
      actions.hit(asDutchOvenId(entity.id), player, tick),
    placements,
  });
  world.beforeEvents.playerInteractWithEntity.subscribe((ev) => {
    if (
      ev.target.typeId === FIRE_PIT_TYPE &&
      ev.itemStack?.typeId === DUTCH_OVEN_ITEM
    ) {
      ev.cancel = true;
      const player = asPlayerId(ev.player.id);
      if (!placements.add(system.currentTick, player)) return;
      const slot = ev.player.selectedSlotIndex;
      const pit = asFirePitId(ev.target.id);
      system.run(() => actions.placeOnFirePit({ player, pit, slot }));
      return;
    }
    if (place(ev.player, ev.target, ev.itemStack?.typeId)) {
      ev.cancel = true;
      return;
    }
    if (ev.target.typeId !== DUTCH_OVEN_TYPE) return;
    ev.cancel = true;
    const id = ev.target.id;
    system.run(() => actions.toggleLid(asDutchOvenId(id), system.currentTick));
  });
  system.afterEvents.scriptEventReceive.subscribe((ev) => {
    if (ev.id === id("test_dutch_oven_on_top")) {
      if (ev.sourceType !== ScriptEventSource.Server) return;
      const [hostType, ...parts] = ev.message.trim().split(/\s+/);
      const request = testTableTopRequest(parts.join(" "));
      if (!hostType || !request) return;
      const host = registry.host(hostType, request.table);
      if (host)
        actions.placeOnTop(host.type.surface, {
          hostType,
          host: request.table,
          aim: request.aim,
          slot: 0,
        });
      return;
    }
    if (ev.id === TEST_DUTCH_OVEN_ON_TABLE_EVENT) {
      if (ev.sourceType !== ScriptEventSource.Server) return;
      const request = testTableRequest(ev.message);
      if (request) actions.placeOnTable({ ...request, slot: 0 });
      return;
    }
    if (ev.id === TEST_DUTCH_OVEN_HOST_EVENT) {
      if (ev.sourceType !== ScriptEventSource.Server) return;
      const parts = ev.message.trim().split(/\s+/);
      const [ovenId, marker] = parts;
      const oven = ovenId ? world.getEntity(ovenId) : undefined;
      if (parts.length === 2 && marker && oven?.typeId === DUTCH_OVEN_TYPE)
        setOvenHost(oven, marker, false);
      return;
    }
    if (ev.id === TEST_DUTCH_OVEN_ON_PIT_EVENT) {
      if (ev.sourceType !== ScriptEventSource.Server) return;
      const pit = ev.message.trim();
      if (pit) actions.placeOnFirePit({ pit: asFirePitId(pit), slot: 0 });
      return;
    }
    if (
      ev.id !== TEST_DUTCH_OVEN_SIMMER_EVENT &&
      ev.id !== TEST_DUTCH_OVEN_HIT_EVENT
    )
      return;
    if (
      ev.id === TEST_DUTCH_OVEN_SIMMER_EVENT &&
      ev.sourceType !== ScriptEventSource.Server
    )
      return;
    const entity = world.getEntity(ev.message);
    if (entity?.typeId !== DUTCH_OVEN_TYPE) return;
    if (ev.id === TEST_DUTCH_OVEN_HIT_EVENT) {
      actions.hit(
        asDutchOvenId(entity.id),
        asPlayerId("test"),
        system.currentTick,
      );
    } else {
      actions.toggleLid(asDutchOvenId(entity.id), system.currentTick);
    }
  });
  system.runInterval(() => {
    hostedItems.check();
    actions.uncoverEmptyFirePits();
  }, DUTCH_OVEN_SPEC.hostCheckTicks);
  system.runInterval(() => {
    for (const dimensionId of ["overworld", "nether", "the_end"]) {
      const dimension = world.getDimension(dimensionId);
      for (const oven of dimension.getEntities({ type: DUTCH_OVEN_TYPE })) {
        if (oven.getProperty(DUTCH_OVEN_SIMMERING_PROPERTY) !== true) continue;
        const at = oven.location;
        dimension.spawnParticle("minecraft:basic_bubble_particle", {
          x: at.x + (Math.random() - 0.5) * 0.2,
          y: at.y + 0.22,
          z: at.z + (Math.random() - 0.5) * 0.2,
        });
        dimension.spawnParticle("minecraft:basic_smoke_particle", {
          x: at.x,
          y: at.y + 0.35,
          z: at.z,
        });
      }
    }
  }, 4);
  return (player, host) => place(player, host, heldTypeId(player));
}
