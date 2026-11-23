import { ScriptEventSource, system, world } from "@minecraft/server";
import type { GasLanternActions } from "../../../application/camp/gasLantern";
import { asGasLanternId } from "../../../domain/camp/gasLantern";
import type { TopHostRegistry } from "../../shared/tableTop/registry";
import { testTableTopRequest } from "../bedrock/tableTopAim";
import {
  GAS_LANTERN_TYPE,
  TEST_GAS_LANTERN_EVENT,
  TEST_GAS_LANTERN_HIT_EVENT,
  TEST_GAS_LANTERN_ON_TABLE_EVENT,
  TEST_GAS_LANTERN_ON_TOP_EVENT,
} from "../identifiers";

export function registerTestGasLantern(
  actions: GasLanternActions,
  registry: TopHostRegistry,
): void {
  system.afterEvents.scriptEventReceive.subscribe((ev) => {
    if (ev.sourceType !== ScriptEventSource.Server) return;
    if (ev.id === TEST_GAS_LANTERN_ON_TOP_EVENT) {
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
    if (ev.id === TEST_GAS_LANTERN_ON_TABLE_EVENT) {
      const request = testTableTopRequest(ev.message);
      if (request) actions.placeOnTable({ ...request, slot: 0 });
      return;
    }
    if (
      ev.id !== TEST_GAS_LANTERN_HIT_EVENT &&
      ev.id !== TEST_GAS_LANTERN_EVENT
    )
      return;
    const entity = world.getEntity(ev.message);
    if (entity?.typeId !== GAS_LANTERN_TYPE) return;
    if (ev.id === TEST_GAS_LANTERN_EVENT) {
      actions.switch(asGasLanternId(entity.id), system.currentTick);
      return;
    }
    actions.hit(asGasLanternId(entity.id), undefined, system.currentTick);
  });
}
