import { ScriptEventSource, system } from "@minecraft/server";
import type { SetDecor } from "../../../../application/vehicle/setDecor";
import { NAMESPACE } from "../../../shared/identifiers";
import { parseTestDecorMessage } from "../../testInput/testDecorMessage";
import { TEST_DECOR_EVENT } from "../identifiers";

// Lets in-game tests set decor before players can place it (ADR 0093).
export function registerTestDecor(decor: SetDecor): void {
  system.afterEvents.scriptEventReceive.subscribe(
    (ev) => {
      if (
        ev.id !== TEST_DECOR_EVENT ||
        ev.sourceType !== ScriptEventSource.Server
      )
        return;
      const cmd = parseTestDecorMessage(ev.message);
      if (!cmd) {
        console.warn(`[${NAMESPACE}] ignored test decor: ${ev.message}`);
        return;
      }
      decor.execute(cmd);
    },
    { namespaces: [NAMESPACE] },
  );
}
