import type { CancelFlow } from "../../../application/build/cancelFlow";
import type { ChooseRoof } from "../../../application/build/chooseRoof";
import type { ClearSelection } from "../../../application/build/clearSelection";
import type { ConfirmRoof } from "../../../application/build/confirmRoof";
import type { ConfirmShape } from "../../../application/build/confirmShape";
import type { CopySelection } from "../../../application/build/copySelection";
import type { SetRoofHeightTo } from "../../../application/build/setRoofHeightTo";
import type { StartPaste } from "../../../application/build/startPaste";
import type { UndoEdit } from "../../../application/build/undoEdit";
import {
  roofMenu,
  shapeMenu,
  utilityMenu,
} from "../../../domain/build/flow/menu";
import type { BuildSessionRepository } from "../../../domain/build/sessionRepository";
import type { PlayerId } from "../../../domain/shared/ids";
export interface MenuCases {
  confirmShape: Pick<ConfirmShape, "execute">;
  chooseRoof: Pick<ChooseRoof, "execute">;
  confirmRoof: Pick<ConfirmRoof, "execute">;
  cancel: Pick<CancelFlow, "backToAiming">;
  copy: Pick<CopySelection, "execute">;
  paste: Pick<StartPaste, "execute">;
  undo: Pick<UndoEdit, "execute">;
  clear: Pick<ClearSelection, "execute">;
  setRoofHeight: Pick<SetRoofHeightTo, "execute">;
}

export class MenuChoices {
  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly cases: MenuCases,
  ) {}
  choose(
    playerId: PlayerId,
    menu: "shape" | "roof" | "utility",
    entryId: string | undefined,
    options: { skipAir?: boolean } = {},
  ): boolean {
    const session = this.repo.get(playerId);
    if (!session) return false;
    const entries =
      menu === "shape"
        ? shapeMenu(session.flow)
        : menu === "roof"
          ? roofMenu(session.flow)
          : utilityMenu(session);
    if (!entries.some((entry) => entry.id === entryId)) return false;
    if (menu === "shape") {
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
          this.cases.chooseRoof.execute({ playerId, kind: entryId });
          break;
        case "cancel":
          this.cases.cancel.backToAiming({ playerId });
          break;
      }
    } else if (menu === "roof") {
      if (entryId === "cancel") this.cases.cancel.backToAiming({ playerId });
      else
        this.cases.confirmRoof.execute({
          playerId,
          hollow: entryId === "hollow",
        });
    } else {
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
      }
    }
    return true;
  }
}
