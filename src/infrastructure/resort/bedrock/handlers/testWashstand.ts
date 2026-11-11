import { ScriptEventSource, system } from "@minecraft/server";
import type { UseWashstand } from "../../../../application/resort/useWashstand";
import { asFurnitureId } from "../../../../domain/resort/ids";
import { TEST_WASHSTAND } from "../../identifiers";
import type { BedrockWashstandWorld } from "../bedrockWashstandWorld";

// Server-only hooks exercise production shows without a connected player (ADR 0010).
export function registerTestWashstand(
  adapter: BedrockWashstandWorld,
  useCase: UseWashstand,
): void {
  system.afterEvents.scriptEventReceive.subscribe(
    (ev) => {
      if (
        ev.sourceType !== ScriptEventSource.Server ||
        ev.id !== TEST_WASHSTAND
      )
        return;
      const parts = ev.message.trim().split(/\s+/);
      const [rawId, operation] = parts;
      if (parts.length !== 2 || !rawId || operation !== "run") return;
      const id = asFurnitureId(rawId);
      if (adapter.entity(id)) useCase.execute({ id, now: system.currentTick });
    },
    { namespaces: ["yasu_ride_test"] },
  );
}
