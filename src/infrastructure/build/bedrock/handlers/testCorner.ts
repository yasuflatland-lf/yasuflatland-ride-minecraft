// Exercises the same tap use cases and feedback adapter with a named player (ADR 0010, 0178).
import { ScriptEventSource, system, world } from "@minecraft/server";
import type { AimHeight } from "../../../../application/build/aimHeight";
import { ClearSelection } from "../../../../application/build/clearSelection";
import { ConfirmLiveHeight } from "../../../../application/build/confirmLiveHeight";
import type { OpenSelectionMenu } from "../../../../application/build/openSelectionMenu";
import type { AimReader } from "../../../../application/build/ports/aim";
import type { BuildBlockWorld } from "../../../../application/build/ports/blocks";
import type {
  BuildFeedback,
  BuildMessage,
} from "../../../../application/build/ports/feedback";
import { SetPoint } from "../../../../application/build/setPoint";
import { TapAir } from "../../../../application/build/tapAir";
import { sizeOf } from "../../../../domain/build/box";
import { setHeight } from "../../../../domain/build/flow/flow";
import { routePress } from "../../../../domain/build/flow/press";
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
  openSelectionMenu: OpenSelectionMenu,
  aim: AimReader,
  aimHeight: AimHeight,
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
        showUndoHint: (id) => feedback.showUndoHint(id),
        showSize: (id, size) => feedback.showSize(id, size),
        showMode: (id, mode) => feedback.showMode(id, mode),
        drawPreview: (id, dimension, set) =>
          feedback.drawPreview(id, dimension, set),
      };
      const session = repo.get(playerId);
      const flow = session?.flow;
      const press =
        flow &&
        (input.tap === "air" || input.tap === "block") &&
        (flow.kind === "selected" || flow.kind === "baseHeight")
          ? routePress({
              flow,
              role: "wand",
              route: input.tap === "air" ? "itemUse" : "blockInteract",
              target: input.tap,
              sneaking: player.isSneaking,
            })
          : undefined;
      const menu =
        press?.kind === "openUtilityMenu"
          ? openSelectionMenu.execute({ playerId })
          : undefined;
      if (input.tap === "clear")
        new ClearSelection(repo, observed).execute({ playerId });
      else if (input.tap === "fixHeight") {
        // Edit fixtures use the supplied corners independently of the client's gaze.
        if (session && flow?.kind === "baseHeight")
          session.setFlow(setHeight(flow, sizeOf(flow.selection.box).y));
        new ConfirmLiveHeight(repo, observed).execute({ playerId });
      } else if (press?.kind === "confirmLiveHeight") {
        const sample = aim.aim(playerId);
        if (sample) {
          aimHeight.execute({ playerId, ray: sample.ray });
          new ConfirmLiveHeight(repo, observed).execute({ playerId });
        }
      } else if (menu === undefined && input.tap === "air")
        new TapAir(repo, observed).execute({ playerId, end: cell });
      else if (menu === undefined)
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
