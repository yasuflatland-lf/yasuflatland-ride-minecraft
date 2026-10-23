import { ScriptEventSource, system } from "@minecraft/server";
import type { UseTentFlap } from "../../../../application/camp/useTentFlap";
import { isFlapId } from "../../../../domain/camp/flaps";
import { asTentId } from "../../../../domain/camp/tent";
import { NAMESPACE } from "../../../shared/identifiers";
import { TEST_TENT_FLAP_EVENT } from "../../identifiers";

// Lets in-game tests tap a flap, which a test has no player to do (ADR 0010, 0132).
export function registerTestTentFlap(useFlap: UseTentFlap): void {
  system.afterEvents.scriptEventReceive.subscribe(
    (ev) => {
      if (
        ev.id !== TEST_TENT_FLAP_EVENT ||
        ev.sourceType !== ScriptEventSource.Server
      )
        return;
      const [raw = "", flap] = ev.message.trim().split(/\s+/);
      if (raw === "" || !isFlapId(flap)) {
        console.warn(`[${NAMESPACE}] ignored test tent flap: "${ev.message}"`);
        return;
      }
      useFlap.execute({
        tentId: asTentId(raw),
        flap,
        tick: system.currentTick,
      });
    },
    { namespaces: [NAMESPACE] },
  );
}
