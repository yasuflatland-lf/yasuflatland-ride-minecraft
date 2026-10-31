// Exercises the same tap use cases and feedback adapter with a named player (ADR 0010, 0178).
import { ScriptEventSource, system, world } from "@minecraft/server";
import { ClearSelection } from "../../../../application/build/clearSelection";
import type { BuildBlockWorld } from "../../../../application/build/ports/blocks";
import type {
  BuildFeedback,
  BuildMessage,
} from "../../../../application/build/ports/feedback";
import { SetPoint } from "../../../../application/build/setPoint";
import { TapAir } from "../../../../application/build/tapAir";
import type { BuildSessionRepository } from "../../../../domain/build/sessionRepository";
import { asDimensionId, asPlayerId } from "../../../../domain/shared/ids";
import {
  BUILD_NAMESPACE,
  TEST_RESULT_EVENT,
  TEST_TAP_EVENT,
} from "../../identifiers";

export function registerTestTap(
  repo: BuildSessionRepository,
  feedback: BuildFeedback,
  blocks: BuildBlockWorld,
): void {
  system.afterEvents.scriptEventReceive.subscribe(
    (ev) => {
      if (
        ev.sourceType !== ScriptEventSource.Server ||
        ev.id !== TEST_TAP_EVENT
      )
        return;
      // JSON preserves spaces in player names. Coordinates must be integer block cells.
      let input: {
        player?: string;
        tap?: string;
        x?: number;
        y?: number;
        z?: number;
      };
      try {
        input = JSON.parse(ev.message);
      } catch {
        return;
      }
      if (
        !input ||
        typeof input.player !== "string" ||
        (input.tap !== "block" && input.tap !== "air" && input.tap !== "clear")
      )
        return;
      const { x, y, z } = input;
      if (
        typeof x !== "number" ||
        typeof y !== "number" ||
        typeof z !== "number" ||
        ![x, y, z].every(Number.isInteger)
      )
        return;
      const player = world.getAllPlayers().find((p) => p.name === input.player);
      if (!player?.isValid) return;
      const playerId = asPlayerId(player.id);
      const dimensionId = asDimensionId(player.dimension.id);
      const cell = { x, y, z };
      let message: BuildMessage | undefined;
      let count: number | undefined;
      const observed: BuildFeedback = {
        showMessage: (id, name, volume) => {
          message = name;
          count = volume;
          feedback.showMessage(id, name, volume);
        },
        drawPreview: (id, dimension, set) =>
          feedback.drawPreview(id, dimension, set),
      };
      if (input.tap === "clear")
        new ClearSelection(repo, observed).execute({ playerId });
      else if (input.tap === "air")
        new TapAir(repo, observed).execute({ playerId, end: cell });
      else
        new SetPoint(repo, blocks, observed).execute({
          playerId,
          dimensionId,
          cell,
        });
      system.sendScriptEvent(
        TEST_RESULT_EVENT,
        JSON.stringify({
          player: player.name,
          message,
          count,
          flow: repo.get(playerId)?.flow ?? null,
          state: blocks.stateAt(dimensionId, cell) ?? null,
          mayEdit: blocks.mayEdit(dimensionId, cell),
        }),
      );
    },
    { namespaces: [BUILD_NAMESPACE] },
  );
}
