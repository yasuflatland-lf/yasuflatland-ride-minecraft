// Exercises the same tap use cases and feedback adapter with a named player (ADR 0010, 0178).
import { ScriptEventSource, system, world } from "@minecraft/server";
import { ClearSelection } from "../../../application/build/clearSelection";
import type { OpenSelectionMenu } from "../../../application/build/openSelectionMenu";
import type { AimReader } from "../../../application/build/ports/aim";
import type { BuildBlockWorld } from "../../../application/build/ports/blocks";
import type {
  BuildFeedback,
  BuildMessage,
} from "../../../application/build/ports/feedback";
import type { PressWand } from "../../../application/build/pressWand";
import { sizeOf } from "../../../domain/build/box";
import { confirmLiveHeight } from "../../../domain/build/flow/heightFlow";
import { routePress } from "../../../domain/build/flow/press";
import type { BuildSessionRepository } from "../../../domain/build/sessionRepository";
import { asDimensionId, asPlayerId } from "../../../domain/shared/ids";
import type { BedrockFeedback } from "../bedrock/bedrockFeedback";
import {
  BUILD_NAMESPACE,
  TEST_RESULT_EVENT,
  TEST_TAP_EVENT,
} from "../identifiers";

export function registerTestTap(
  repo: BuildSessionRepository,
  feedback: BedrockFeedback,
  blocks: BuildBlockWorld,
  openSelectionMenu: OpenSelectionMenu,
  aim: AimReader,
  pressWand: PressWand,
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
        (input.tap !== "block" &&
          input.tap !== "air" &&
          input.tap !== "clear" &&
          input.tap !== "fixHeight")
      )
        return;
      const { x, y, z, tap } = input;
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
      const session = repo.get(playerId);
      const flow = session?.flow;
      let menu: ReturnType<OpenSelectionMenu["execute"]> | undefined;
      const listener = {
        onMessage: ((id, name, volume) => {
          if (id !== playerId) return;
          message = name;
          count = volume;
        }) satisfies BuildFeedback["showMessage"],
      };
      feedback.listeners.add(listener);
      try {
        if (tap === "clear")
          new ClearSelection(repo, feedback).execute({ playerId });
        else if (tap === "fixHeight") {
          // Edit fixtures use the supplied corners independently of the client's gaze.
          if (session && flow?.kind === "baseHeight")
            session.setFlowForTest(
              confirmLiveHeight({
                ...flow,
                liveHeight: sizeOf(flow.selection.box).y,
              }),
            );
        } else {
          const intent = routePress({
            flow: flow ?? { kind: "idle" },
            role: "wand",
            route: tap === "air" ? "itemUse" : "blockInteract",
            target: tap,
            // A scripted air tap supplies the endpoint regardless of the player's stance.
            sneaking: false,
          }).kind;
          const ray =
            intent === "confirmLiveHeight" ? aim.aim(playerId)?.ray : undefined;
          const followUp = pressWand.execute({
            playerId,
            dimensionId,
            intent,
            cell,
            ray,
          });
          // The fixture reports an explicitly requested selection menu without showing a form.
          if (flow?.kind === "selected" && followUp === "utilityMenu")
            menu = openSelectionMenu.execute({ playerId });
        }
      } finally {
        feedback.listeners.delete(listener);
      }
      system.sendScriptEvent(
        TEST_RESULT_EVENT,
        JSON.stringify({
          player: player.name,
          message,
          count,
          menu,
          flow: repo.get(playerId)?.flow ?? null,
          state: blocks.stateAt(dimensionId, cell) ?? null,
          mayEdit: blocks.mayEdit(dimensionId, cell),
        }),
      );
    },
    { namespaces: [BUILD_NAMESPACE] },
  );
}
