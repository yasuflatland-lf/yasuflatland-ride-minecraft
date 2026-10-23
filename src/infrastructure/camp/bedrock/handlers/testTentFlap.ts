import { ScriptEventSource, system } from "@minecraft/server";
import type { UseTentFlap } from "../../../../application/camp/useTentFlap";
import { FLAP_IDS } from "../../../../domain/camp/flaps";
import { asTentId, type FlapId } from "../../../../domain/camp/tent";
import { NAMESPACE } from "../../../shared/identifiers";
import { TEST_TENT_FLAP_EVENT } from "../../identifiers";

const isFlapId = (v: string | undefined): v is FlapId =>
  (FLAP_IDS as readonly (string | undefined)[]).includes(v);

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
