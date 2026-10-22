import { ScriptEventSource, system } from "@minecraft/server";
import type { HitChair } from "../../../../application/camp/hitChair";
import { asChairId } from "../../../../domain/camp/chair";
import { NAMESPACE } from "../../../shared/identifiers";
import { TEST_CHAIR_HIT_EVENT } from "../../identifiers";

// Lets in-game tests hit a chair, which a test has no player to do (ADR 0010, 0122).
export function registerTestChairHit(hitChair: HitChair): void {
  system.afterEvents.scriptEventReceive.subscribe(
    (ev) => {
      if (
        ev.id !== TEST_CHAIR_HIT_EVENT ||
        ev.sourceType !== ScriptEventSource.Server
      )
        return;
      const chairId = ev.message.trim();
      if (chairId === "") {
        console.warn(`[${NAMESPACE}] ignored test chair hit: no entity id`);
        return;
      }
      hitChair.execute({
        chairId: asChairId(chairId),
        tick: system.currentTick,
      });
    },
    { namespaces: [NAMESPACE] },
  );
}
