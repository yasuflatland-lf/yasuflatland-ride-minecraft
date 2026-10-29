// Particles cannot be read back from a script, so this hook reports what the
// outline use case asks the feedback adapter to draw for a named player (ADR 0010, 0183).
import { ScriptEventSource, system, world } from "@minecraft/server";
import type { BuildFeedback } from "../../../../application/build/ports/feedback";
import type { RiderGate } from "../../../../application/build/ports/rider";
import { ShowOutline } from "../../../../application/build/showOutline";
import type { BuildSessionRepository } from "../../../../domain/build/sessionRepository";
import { BUILD_SPEC } from "../../../../domain/build/spec";
import type { Cell } from "../../../../domain/shared/cells";
import { asPlayerId } from "../../../../domain/shared/ids";
import {
  BUILD_NAMESPACE,
  TEST_CORNER_MARKER_EVENT,
  TEST_RESULT_EVENT,
} from "../../identifiers";

export function registerTestCornerMarker(
  repo: BuildSessionRepository,
  gate: RiderGate,
  feedback: BuildFeedback,
): void {
  system.afterEvents.scriptEventReceive.subscribe(
    (ev) => {
      if (
        ev.sourceType !== ScriptEventSource.Server ||
        ev.id !== TEST_CORNER_MARKER_EVENT
      )
        return;
      let input: { player?: string };
      try {
        input = JSON.parse(ev.message);
      } catch {
        return;
      }
      if (!input || typeof input.player !== "string") return;
      const player = world.getAllPlayers().find((p) => p.name === input.player);
      if (!player?.isValid) return;
      const playerId = asPlayerId(player.id);
      let corner: Cell | null = null;
      let cornerCount = 0;
      let outline = false;
      const observed: BuildFeedback = {
        showMessage: (id, message, count) =>
          feedback.showMessage(id, message, count),
        drawCorner: (id, dimension, cell) => {
          if (id === playerId) {
            corner = cell;
            cornerCount++;
          }
          feedback.drawCorner(id, dimension, cell);
        },
        drawOutline: (id, dimension, box, style) => {
          // A paste preview left by an earlier test is not the selection outline.
          if (id === playerId && style === "selection") outline = true;
          feedback.drawOutline(id, dimension, box, style);
        },
      };
      new ShowOutline(repo, gate, observed).execute(BUILD_SPEC.outlineInterval);
      system.sendScriptEvent(
        TEST_RESULT_EVENT,
        JSON.stringify({ player: player.name, corner, outline, cornerCount }),
      );
    },
    { namespaces: [BUILD_NAMESPACE] },
  );
}
