import type { CancelFlow } from "../../../application/build/cancelFlow";
import type { ChooseCopy } from "../../../application/build/chooseCopy";
import type { ChooseHeighted } from "../../../application/build/chooseHeighted";
import type { ClearSelection } from "../../../application/build/clearSelection";
import type { ConfirmCopyHeight } from "../../../application/build/confirmCopyHeight";
import type { ConfirmHeighted } from "../../../application/build/confirmHeighted";
import type { ConfirmShape } from "../../../application/build/confirmShape";
import type { CopySelection } from "../../../application/build/copySelection";
import type { SetHeightTo } from "../../../application/build/setHeightTo";
import type { StartPaste } from "../../../application/build/startPaste";
import type { StopPaste } from "../../../application/build/stopPaste";
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
  chooseCopy: Pick<ChooseCopy, "execute">;
  confirmCopyHeight: Pick<ConfirmCopyHeight, "execute">;
  confirmShape: Pick<ConfirmShape, "execute">;
  chooseHeighted: Pick<ChooseHeighted, "execute">;
  confirmHeighted: Pick<ConfirmHeighted, "execute">;
  cancel: Pick<CancelFlow, "backToAiming">;
  copy: Pick<CopySelection, "execute">;
  paste: Pick<StartPaste, "execute">;
  stopPaste: Pick<StopPaste, "execute">;
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
    options: { skipAir?: boolean } = {},
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
        case "cube":
          this.cases.chooseHeighted.execute({ playerId, kind: entryId });
          break;
        case "copy":
          this.cases.chooseCopy.execute({ playerId });
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
        !isOffered(pasteMenu(session), entryId)
      )
        return false;
      if (entryId === "endPaste") this.cases.stopPaste.execute({ playerId });
      else this.cases.undo.execute({ playerId });
    } else {
      if (!isOffered(utilityMenu(session), entryId)) return false;
      switch (entryId) {
        case "copy":
        case "undo":
        case "clear":
          this.cases[entryId].execute({ playerId });
          break;
        case "paste":
          this.cases.paste.execute({
            playerId,
            skipAir: options.skipAir ?? false,
          });
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
