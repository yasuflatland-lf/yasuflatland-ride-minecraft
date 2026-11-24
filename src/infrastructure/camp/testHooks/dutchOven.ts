import { ScriptEventSource, system, world } from "@minecraft/server";
import type { DutchOvenActions } from "../../../application/camp/dutchOven";
import { campTableLegacySpot } from "../../../application/camp/hostedKind";
import { asDutchOvenId } from "../../../domain/camp/dutchOven";
import { asFirePitId } from "../../../domain/camp/firePit";
import { asTableId, type TableId } from "../../../domain/camp/table";
import type { LocalPoint } from "../../../domain/shared/tableTop";
import type { TopHostRegistry } from "../../shared/tableTop/registry";
import { setOvenHost } from "../bedrock/bedrockDutchOvenWorld";
import { testTableTopRequest } from "../bedrock/tableTopAim";
import {
  DUTCH_OVEN_TYPE,
  TEST_DUTCH_OVEN_HIT_EVENT,
  TEST_DUTCH_OVEN_HOST_EVENT,
  TEST_DUTCH_OVEN_ON_PIT_EVENT,
  TEST_DUTCH_OVEN_ON_TABLE_EVENT,
  TEST_DUTCH_OVEN_ON_TOP_EVENT,
  TEST_DUTCH_OVEN_SIMMER_EVENT,
} from "../identifiers";
import { placeTestItemOnTop } from "./hostedOnTop";

/** Reads `<table> <0|1>` as an old spot, or `<table> <x> <z>` as local pixels. */
function testTableRequest(
  message: string,
): { table: TableId; aim: LocalPoint } | undefined {
  const [table, spot, ...rest] = message.trim().split(/\s+/);
  if (table && rest.length === 0 && /^[01]$/.test(spot ?? "")) {
    const aim = campTableLegacySpot(Number(spot));
    return aim ? { table: asTableId(table), aim } : undefined;
  }
  return testTableTopRequest(message);
}

export function registerTestDutchOven(
  actions: DutchOvenActions,
  registry: TopHostRegistry,
): void {
  system.afterEvents.scriptEventReceive.subscribe((ev) => {
    if (ev.sourceType !== ScriptEventSource.Server) return;
    if (ev.id === TEST_DUTCH_OVEN_ON_TOP_EVENT) {
      placeTestItemOnTop(ev.message, registry, actions);
      return;
    }
    if (ev.id === TEST_DUTCH_OVEN_ON_TABLE_EVENT) {
      const request = testTableRequest(ev.message);
      if (request) actions.placeOnTable({ ...request, slot: 0 });
      return;
    }
    if (ev.id === TEST_DUTCH_OVEN_HOST_EVENT) {
      const parts = ev.message.trim().split(/\s+/);
      const [ovenId, marker] = parts;
      const oven = ovenId ? world.getEntity(ovenId) : undefined;
      if (parts.length === 2 && marker && oven?.typeId === DUTCH_OVEN_TYPE)
        setOvenHost(oven, marker, false);
      return;
    }
    if (ev.id === TEST_DUTCH_OVEN_ON_PIT_EVENT) {
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
      actions.hit(asDutchOvenId(entity.id), undefined, system.currentTick);
    } else {
      actions.toggleLid(asDutchOvenId(entity.id), system.currentTick);
    }
  });
}
