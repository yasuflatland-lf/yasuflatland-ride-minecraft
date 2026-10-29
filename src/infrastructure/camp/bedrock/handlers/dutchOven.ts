import {
  Direction,
  Player,
  ScriptEventSource,
  system,
  world,
} from "@minecraft/server";
import type { DutchOvenActions } from "../../../../application/camp/dutchOven";
import type { HostedItemsGuard } from "../../../../application/camp/hostedItemsGuard";
import { asDutchOvenId } from "../../../../domain/camp/dutchOven";
import { asFirePitId } from "../../../../domain/camp/firePit";
import { DUTCH_OVEN_SPEC, TABLE_SPOTS } from "../../../../domain/camp/spec";
import type { LocalPoint } from "../../../../domain/camp/tabletop";
import {
  asDimensionId,
  asPlayerId,
  type PlayerId,
} from "../../../../domain/shared/ids";
import { TickScopedSet } from "../../../../domain/shared/tickScoped";
import {
  CAMP_TABLE_TYPE,
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
import {
  showTableTopRefusal,
  tableTopAim,
  testTableTopRequest,
} from "../tableTopAim";

/** Reads `<table> <0|1>` as an old spot, or `<table> <x> <z>` as local pixels. */
function testTableRequest(
  message: string,
): { table: string; aim: LocalPoint } | undefined {
  const [table, spot, ...rest] = message.trim().split(/\s+/);
  if (table && rest.length === 0 && /^[01]$/.test(spot ?? "")) {
    const aim = TABLE_SPOTS[Number(spot)];
    return aim ? { table, aim } : undefined;
  }
  return testTableTopRequest(message);
}

export function registerDutchOven(
  actions: DutchOvenActions,
  hostedItems: HostedItemsGuard,
): void {
  const placements = new TickScopedSet<PlayerId>();
  world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
    if (!ev.isFirstEvent || ev.itemStack?.typeId !== DUTCH_OVEN_ITEM) return;
    const dimension = asDimensionId(ev.block.dimension.id);
    const block = ev.block.location;
    if (
      !actions.canUseBlock(
        dimension,
        block,
        ev.blockFace === Direction.Up ? "up" : "other",
      )
    )
      return;
    ev.cancel = true;
    const player = asPlayerId(ev.player.id);
    if (!placements.add(system.currentTick, player)) return;
    const yaw = ev.player.getRotation().y;
    const slot = ev.player.selectedSlotIndex;
    system.run(() => actions.place({ player, dimension, block, yaw, slot }));
  });
  world.beforeEvents.playerInteractWithEntity.subscribe((ev) => {
    if (
      (ev.target.typeId === FIRE_PIT_TYPE ||
        ev.target.typeId === CAMP_TABLE_TYPE) &&
      ev.itemStack?.typeId === DUTCH_OVEN_ITEM
    ) {
      ev.cancel = true;
      const player = asPlayerId(ev.player.id);
      if (!placements.add(system.currentTick, player)) return;
      const slot = ev.player.selectedSlotIndex;
      if (ev.target.typeId === FIRE_PIT_TYPE) {
        const pit = asFirePitId(ev.target.id);
        system.run(() => actions.placeOnFirePit({ player, pit, slot }));
      } else {
        const table = ev.target.id;
        const aim = tableTopAim(ev.player, ev.target);
        const placer = ev.player;
        system.run(() =>
          showTableTopRefusal(
            placer,
            actions.placeOnTable({ player, table, slot, aim }),
          ),
        );
      }
      return;
    }
    if (ev.target.typeId !== DUTCH_OVEN_TYPE) return;
    ev.cancel = true;
  });
  world.afterEvents.entityHitEntity.subscribe((ev) => {
    if (
      !(ev.damagingEntity instanceof Player) ||
      ev.hitEntity.typeId !== DUTCH_OVEN_TYPE
    )
      return;
    actions.hit(
      asDutchOvenId(ev.hitEntity.id),
      asPlayerId(ev.damagingEntity.id),
      system.currentTick,
    );
  });
  system.afterEvents.scriptEventReceive.subscribe((ev) => {
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
    const entity = world.getEntity(ev.message);
    if (entity?.typeId !== DUTCH_OVEN_TYPE) return;
    if (ev.id === TEST_DUTCH_OVEN_HIT_EVENT) {
      actions.hit(
        asDutchOvenId(entity.id),
        asPlayerId("test"),
        system.currentTick,
      );
    } else {
      entity.setProperty(
        DUTCH_OVEN_SIMMERING_PROPERTY,
        entity.getProperty(DUTCH_OVEN_SIMMERING_PROPERTY) !== true,
      );
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
}
