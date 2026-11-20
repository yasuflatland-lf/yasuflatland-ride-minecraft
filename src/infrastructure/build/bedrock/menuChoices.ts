import type { CancelFlow } from "../../../application/build/cancelFlow";
import type { ChooseAdjustHeight } from "../../../application/build/chooseAdjustHeight";
import type { ChooseBoxStep } from "../../../application/build/chooseBoxStep";
import type { ChooseHeighted } from "../../../application/build/chooseHeighted";
import type { ChooseSideCylinder } from "../../../application/build/chooseSideCylinder";
import type { ChooseTerrain } from "../../../application/build/chooseTerrain";
import type { ClearSelection } from "../../../application/build/clearSelection";
import type { CloseBuildMenu } from "../../../application/build/closeBuildMenu";
import type { ConfirmHeighted } from "../../../application/build/confirmHeighted";
import type { ConfirmShape } from "../../../application/build/confirmShape";
import type { ConfirmTerrain } from "../../../application/build/confirmTerrain";
import type { CopySelection } from "../../../application/build/copySelection";
import type { EndPasting } from "../../../application/build/endPasting";
import type { NewCopy } from "../../../application/build/newCopy";
import type { OpenBuildMenu } from "../../../application/build/openBuildMenu";
import type { OpenSelectionMenu } from "../../../application/build/openSelectionMenu";
import type { SetHeightTo } from "../../../application/build/setHeightTo";
import type { UndoEdit } from "../../../application/build/undoEdit";
import {
  type BuildEntryId,
  buildMenu,
  contentsMenu,
  type EditEntryId,
  isShapeEntryOffered,
  type MenuEntry,
  pasteMenu,
  shapeChoiceOf,
  shapeMenu,
  terrainMenu,
  utilityMenu,
} from "../../../domain/build/flow/menu";
import type { BuildSessionRepository } from "../../../domain/build/sessionRepository";
import type { PlayerId } from "../../../domain/shared/ids";

function isOffered<Id extends string>(
  entries: MenuEntry<Id>[],
  entryId: string | undefined,
): entryId is Id {
  return entries.some((entry) => entry.id === entryId);
}

export interface MenuCases {
  openSelectionMenu: Pick<OpenSelectionMenu, "execute">;
  openBuildMenu: Pick<OpenBuildMenu, "execute">;
  closeBuildMenu: Pick<CloseBuildMenu, "execute">;
  chooseAdjustHeight: Pick<ChooseAdjustHeight, "execute">;
  chooseBoxStep: Pick<ChooseBoxStep, "execute">;
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
      if (
        !isOffered(
          [...shapeMenu(session.flow), ...buildMenu(session.flow)],
          entryId,
        ) ||
        !isShapeEntryOffered(session.flow, entryId)
      )
        return false;
      const choice = shapeChoiceOf(entryId);
      switch (choice.kind) {
        case "adjustHeight":
          this.cases.chooseAdjustHeight.execute({ playerId });
          return true;
        case "openBuild":
          this.cases.openBuildMenu.execute({ playerId });
          return true;
        case "closeBuild":
          this.cases.closeBuildMenu.execute({ playerId });
          return true;
        case "edit":
          this.dispatchEditEntry(choice.id, playerId);
          return true;
        case "build":
          this.dispatchBuildEntry(choice.id, playerId);
          return true;
        case "cancel":
          this.cases.clear.execute({ playerId });
          return true;
      }
      const exhaustive: never = choice;
      return exhaustive;
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
      if (session.flow.kind !== "pasteAim" || !isOffered(pasteMenu(), entryId))
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
      case "sideCylinder":
        this.cases.chooseSideCylinder.execute({ playerId });
        break;

      default: {
        const exhaustive: never = id;
        return exhaustive;
      }
    }
  }
}
