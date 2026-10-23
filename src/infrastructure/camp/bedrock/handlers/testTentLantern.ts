import { ScriptEventSource, system } from "@minecraft/server";
import type { SwitchLantern } from "../../../../application/camp/switchLantern";
import { asTentId } from "../../../../domain/camp/tent";
import { NAMESPACE } from "../../../shared/identifiers";
import { TEST_TENT_LANTERN_EVENT } from "../../identifiers";

// Lets in-game tests switch a tent's lantern, which a test has no player to do (ADR 0010).
export function registerTestTentLantern(lantern: SwitchLantern): void {
  system.afterEvents.scriptEventReceive.subscribe(
    (ev) => {
      if (
        ev.id !== TEST_TENT_LANTERN_EVENT ||
        ev.sourceType !== ScriptEventSource.Server
      )
        return;
      const tentId = ev.message.trim();
      if (tentId === "") {
        console.warn(
          `[${NAMESPACE}] ignored test tent lantern switch: no entity id`,
        );
        return;
      }
      lantern.execute({ tentId: asTentId(tentId), tick: system.currentTick });
    },
    { namespaces: [NAMESPACE] },
  );
}
