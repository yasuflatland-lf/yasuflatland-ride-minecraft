// Lets in-game tests pitch and hit a tent, which a test has no player to do (ADR 0010, 0131).
import { ScriptEventSource, system } from "@minecraft/server";
import type { PitchTent } from "../../../../application/camp/pitchTent";
import type { TakeDownTent } from "../../../../application/camp/takeDownTent";
import { asTentId } from "../../../../domain/camp/tent";
import { asDimensionId } from "../../../../domain/shared/ids";
import { NAMESPACE } from "../../../shared/identifiers";
import { TEST_TENT_HIT_EVENT, TEST_TENT_PITCH_EVENT } from "../../identifiers";

const OVERWORLD = asDimensionId("minecraft:overworld");

export function registerTestTent(
  pitchTent: PitchTent,
  takeDown: TakeDownTent,
): void {
  system.afterEvents.scriptEventReceive.subscribe(
    (ev) => {
      if (ev.sourceType !== ScriptEventSource.Server) return;
      if (ev.id === TEST_TENT_PITCH_EVENT) {
        const parts = ev.message.trim().split(/\s+/).map(Number);
        const [x, y, z, yaw] = parts;
        if (
          parts.length !== 4 ||
          x === undefined ||
          y === undefined ||
          z === undefined ||
          yaw === undefined ||
          ![x, y, z].every(Number.isInteger) ||
          !Number.isFinite(yaw)
        ) {
          console.warn(
            `[${NAMESPACE}] ignored test tent pitch: "${ev.message}"`,
          );
          return;
        }
        pitchTent.execute({
          dimensionId: OVERWORLD,
          clicked: { x, y, z },
          yaw,
          slot: 0,
        });
      } else if (ev.id === TEST_TENT_HIT_EVENT) {
        const tentId = ev.message.trim();
        if (tentId === "") {
          console.warn(`[${NAMESPACE}] ignored test tent hit: no entity id`);
          return;
        }
        takeDown.execute({
          tentId: asTentId(tentId),
          tick: system.currentTick,
        });
      }
    },
    { namespaces: [NAMESPACE] },
  );
}
