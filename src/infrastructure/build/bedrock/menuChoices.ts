import type { CancelFlow } from "../../../application/build/cancelFlow";
import type { ChooseBoxStep } from "../../../application/build/chooseBoxStep";
import type { ChooseHeighted } from "../../../application/build/chooseHeighted";
import type { ChooseSideCylinder } from "../../../application/build/chooseSideCylinder";
import type { ClearSelection } from "../../../application/build/clearSelection";
import type { ConfirmBoxStep } from "../../../application/build/confirmBoxStep";
import type { ConfirmHeighted } from "../../../application/build/confirmHeighted";
import type { ConfirmShape } from "../../../application/build/confirmShape";
import type { CopySelection } from "../../../application/build/copySelection";
import type { EndPasting } from "../../../application/build/endPasting";
import type { NewCopy } from "../../../application/build/newCopy";
import type { SetHeightTo } from "../../../application/build/setHeightTo";
import type { ToggleSkipAir } from "../../../application/build/toggleSkipAir";
import type { UndoEdit } from "../../../application/build/undoEdit";
import {
  contentsMenu,
  type MenuEntry,
  pasteMenu,
  shapeMenu,
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
  chooseBoxStep: Pick<ChooseBoxStep, "execute">;
  confirmBoxStep: Pick<ConfirmBoxStep, "execute">;
  confirmShape: Pick<ConfirmShape, "execute">;
  chooseHeighted: Pick<ChooseHeighted, "execute">;
  chooseSideCylinder: Pick<ChooseSideCylinder, "execute">;
  confirmHeighted: Pick<ConfirmHeighted, "execute">;
  cancel: Pick<CancelFlow, "backToAiming">;
  copy: Pick<CopySelection, "execute">;
  toggleSkipAir: Pick<ToggleSkipAir, "execute">;
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
    menu: "shape" | "contents" | "utility" | "paste",
    entryId: string | undefined,
  ): boolean {
    const session = this.repo.get(playerId);
    if (!session) return false;
    if (menu === "shape") {
      if (!isOffered(shapeMenu(session.flow), entryId)) return false;
      switch (entryId) {
        case "place":
        case "fill":
        case "frame":
        case "faces":
        case "walls":
          this.cases.confirmShape.execute({
            playerId,
            style: entryId === "place" ? "fill" : entryId,
          });
          break;
        case "gable":
        case "hip":
        case "cylinder":
        case "sphere":
        case "cube":
          this.cases.chooseHeighted.execute({ playerId, kind: entryId });
          break;
        case "sideCylinder":
          this.cases.chooseSideCylinder.execute({ playerId });
          break;
        case "cut":
        case "copy":
          this.cases.chooseBoxStep.execute({ playerId, kind: entryId });
          break;
        case "cancel":
          this.cases.cancel.backToAiming({ playerId });
          break;
        default: {
          const exhaustive: never = entryId;
          return exhaustive;
        }
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
    } else if (menu === "paste") {
      if (
        session.flow.kind !== "pasteAim" ||
        !isOffered(
          pasteMenu({
            hasHistory: session.hasHistory,
            skipAir: session.flow.kind === "pasteAim" && session.flow.skipAir,
          }),
          entryId,
        )
      )
        return false;
      if (entryId === "endPaste") this.cases.endPasting.execute(playerId);
      else if (entryId === "newCopy") this.cases.newCopy.execute(playerId);
      else if (entryId === "skipAir")
        this.cases.toggleSkipAir.execute({ playerId });
      else this.cases.undo.execute({ playerId });
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
}
