import type { CancelFlow } from "../../../application/build/cancelFlow";
import type { ChooseBoxStep } from "../../../application/build/chooseBoxStep";
import type { ChooseHeighted } from "../../../application/build/chooseHeighted";
import type { ChooseSideCylinder } from "../../../application/build/chooseSideCylinder";
import type { ChooseTerrain } from "../../../application/build/chooseTerrain";
import type { ClearSelection } from "../../../application/build/clearSelection";
import type { ConfirmBoxStep } from "../../../application/build/confirmBoxStep";
import type { ConfirmHeighted } from "../../../application/build/confirmHeighted";
import type { ConfirmShape } from "../../../application/build/confirmShape";
import type { ConfirmTerrain } from "../../../application/build/confirmTerrain";
import type { CopySelection } from "../../../application/build/copySelection";
import type { EndPasting } from "../../../application/build/endPasting";
import type { NewCopy } from "../../../application/build/newCopy";
import type { SetHeightTo } from "../../../application/build/setHeightTo";
import type { UndoEdit } from "../../../application/build/undoEdit";
import { type BuildFlow, openBuildMenu } from "../../../domain/build/flow/flow";
import {
  type BuildEntryId,
  contentsMenu,
  type EditEntryId,
  isBuildEntry,
  isEditEntry,
  type MenuEntry,
  pasteMenu,
  terrainMenu,
  utilityMenu,
} from "../../../domain/build/flow/menu";
import type { BuildSessionRepository } from "../../../domain/build/sessionRepository";
import type { PlayerId } from "../../../domain/shared/ids";
import { flatShapeMenu } from "./flatShapeMenu";

function isOffered<Id extends string>(
  entries: MenuEntry<Id>[],
  entryId: string | undefined,
): entryId is Id {
  return entries.some((entry) => entry.id === entryId);
}

export interface MenuCases {
  chooseBoxStep: Pick<ChooseBoxStep, "execute">;
  confirmBoxStep: Pick<ConfirmBoxStep, "execute">;
  confirmShape: Pick<ConfirmShape, "execute">;
  chooseHeighted: Pick<ChooseHeighted, "execute">;
  chooseSideCylinder: Pick<ChooseSideCylinder, "execute">;
  confirmHeighted: Pick<ConfirmHeighted, "execute">;
  chooseTerrain: Pick<ChooseTerrain, "execute">;
  confirmTerrain: Pick<ConfirmTerrain, "execute">;
  cancel: Pick<CancelFlow, "backToAiming">;
  copy: Pick<CopySelection, "execute">;
  endPasting: Pick<EndPasting, "execute">;
  newCopy: Pick<NewCopy, "execute">;
  undo: Pick<UndoEdit, "execute">;
  clear: Pick<ClearSelection, "execute">;
  setHeight: Pick<SetHeightTo, "execute">;
}

export class MenuChoices {
  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly cases: MenuCases,
  ) {}
  choose(
    playerId: PlayerId,
    menu: "shape" | "contents" | "terrain" | "utility" | "paste",
    entryId: string | undefined,
  ): boolean {
    const session = this.repo.get(playerId);
    if (!session) return false;
    if (menu === "shape") {
      if (!isOffered(flatShapeMenu(session.flow), entryId)) return false;
      if (isEditEntry(entryId)) {
        this.dispatchEditEntry(entryId, playerId);
      } else if (isBuildEntry(entryId)) {
        this.dispatchBuildEntry(entryId, playerId);
      } else {
        this.cases.cancel.backToAiming({ playerId });
      }
    } else if (menu === "contents") {
      if (!isOffered(contentsMenu(session.flow), entryId)) return false;
      switch (entryId) {
        case "cancel":
          this.cases.cancel.backToAiming({ playerId });
          break;
        case "fill":
        case "hollow":
        case "tube":
          this.cases.confirmHeighted.execute({ playerId, fill: entryId });
          break;
        default: {
          const exhaustive: never = entryId;
          return exhaustive;
        }
      }
    } else if (menu === "terrain") {
      if (!isOffered(terrainMenu(session.flow), entryId)) return false;
      switch (entryId) {
        case "confirm":
          this.cases.confirmTerrain.execute({ playerId });
          break;
        case "cancel":
          this.cases.cancel.backToAiming({ playerId });
          break;
        default: {
          const exhaustive: never = entryId;
          return exhaustive;
        }
      }
    } else if (menu === "paste") {
      if (
        session.flow.kind !== "pasteAim" ||
        !isOffered(
          pasteMenu({
            hasHistory: session.hasHistory,
          }),
          entryId,
        )
      )
        return false;
      switch (entryId) {
        case "cancel":
          break;
        case "endPaste":
          this.cases.endPasting.execute(playerId);
          break;
        case "newCopy":
          this.cases.newCopy.execute(playerId);
          break;
        case "undo":
          this.cases.undo.execute({ playerId });
          break;
        default: {
          const exhaustive: never = entryId;
          return exhaustive;
        }
      }
    } else {
      if (!isOffered(utilityMenu(session), entryId)) return false;
      switch (entryId) {
        case "copy":
        case "undo":
        case "clear":
          this.cases[entryId].execute({ playerId });
          break;
        default: {
          const exhaustive: never = entryId;
          return exhaustive;
        }
      }
    }
    return true;
  }

  private dispatchEditEntry(id: EditEntryId, playerId: PlayerId) {
    switch (id) {
      case "fillBelow":
      case "removeAbove":
        this.cases.chooseTerrain.execute({ playerId, op: id });
        break;
      case "rotate":
      case "cut":
      case "copy":
        this.cases.chooseBoxStep.execute({ playerId, kind: id });
        break;

      default: {
        const exhaustive: never = id;
        return exhaustive;
      }
    }
  }

  private dispatchBuildEntry(id: BuildEntryId, playerId: PlayerId) {
    switch (id) {
      case "place":
      case "fill":
      case "frame":
      case "faces":
      case "walls":
        this.cases.confirmShape.execute({
          playerId,
          style: id === "place" ? "fill" : id,
        });
        break;
      case "gable":
      case "hip":
      case "cylinder":
      case "sphere":
      case "cube":
        this.cases.chooseHeighted.execute({ playerId, kind: id });
        break;
      case "sideCylinder": {
        const session = this.repo.get(playerId);
        const before = session?.flow;
        if (session && before) session.setFlow(openBuildMenu(before));
        this.cases.chooseSideCylinder.execute({ playerId });
        // A refused choice leaves the flow on the opened menu level; put it back.
        if (
          session &&
          before &&
          isBuildMenuOpen(this.repo.get(playerId)?.flow)
        ) {
          session.setFlow(before);
        }
        break;
      }

      default: {
        const exhaustive: never = id;
        return exhaustive;
      }
    }
  }
}

function isBuildMenuOpen(flow: BuildFlow | undefined): boolean {
  return flow?.kind === "endpoint" && flow.menuLevel === "build";
}
