import { ScriptEventSource, system } from "@minecraft/server";
import type { ShowSound } from "../../../../application/resort/ports/showSound";
import type { ShowStates } from "../../../../application/resort/showStates";
import { UseToilet } from "../../../../application/resort/useToilet";
import { WatchToiletDismount } from "../../../../application/resort/watchToiletDismount";
import type { SpaceCheck } from "../../../../application/shared/ports/space";
import { asFurnitureId, type FurnitureId } from "../../../../domain/resort/ids";
import { asPlayerId } from "../../../../domain/shared/ids";
import { TEST_TOILET } from "../../identifiers";
import { BedrockToiletWorld } from "../bedrockToiletWorld";

export function registerTestToilet(
  states: ShowStates,
  sound: ShowSound,
  deps: { isVehicleSpace: SpaceCheck; isCampSpace: SpaceCheck },
): void {
  // Scenarios have no connected player, so accept a loaded seat without a rider (ADR 0010).
  class TestWorld extends BedrockToiletWorld {
    override seat(id: FurnitureId): boolean {
      return this.entity(id) !== undefined;
    }
  }
  const adapter = new TestWorld(deps);
  const watch = new WatchToiletDismount(
    adapter,
    states,
    sound,
    () => system.currentTick,
  );
  const useCase = new UseToilet(adapter, states, watch);
  system.afterEvents.scriptEventReceive.subscribe(
    (ev) => {
      if (ev.sourceType !== ScriptEventSource.Server || ev.id !== TEST_TOILET)
        return;
      const parts = ev.message.trim().split(/\s+/);
      const [rawId, operation] = parts;
      if (
        parts.length !== 2 ||
        !rawId ||
        (operation !== "sit" && operation !== "dismount")
      )
        return;
      const id = asFurnitureId(rawId);
      if (!adapter.entity(id)) return;
      if (operation === "sit")
        useCase.execute({
          id,
          player: asPlayerId("test-toilet"),
          now: system.currentTick,
        });
      else watch.refresh();
    },
    { namespaces: ["yasu_ride_test"] },
  );
}
