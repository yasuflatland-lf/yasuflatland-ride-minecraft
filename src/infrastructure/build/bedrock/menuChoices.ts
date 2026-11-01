import type { CancelFlow } from "../../../application/build/cancelFlow";
import type { ChooseHeighted } from "../../../application/build/chooseHeighted";
import type { ClearSelection } from "../../../application/build/clearSelection";
import type { ConfirmHeighted } from "../../../application/build/confirmHeighted";
import type { ConfirmShape } from "../../../application/build/confirmShape";
import type { CopySelection } from "../../../application/build/copySelection";
import type { SetHeightTo } from "../../../application/build/setHeightTo";
import type { StartPaste } from "../../../application/build/startPaste";
import type { UndoEdit } from "../../../application/build/undoEdit";
import {
  contentsMenu,
  shapeMenu,
  utilityMenu,
} from "../../../domain/build/flow/menu";
import type { BuildSessionRepository } from "../../../domain/build/sessionRepository";
import type { FillStyle } from "../../../domain/build/volume/kind";
import type { PlayerId } from "../../../domain/shared/ids";
export interface MenuCases {
  confirmShape: Pick<ConfirmShape, "execute">;
  chooseHeighted: Pick<ChooseHeighted, "execute">;
  confirmHeighted: Pick<ConfirmHeighted, "execute">;
  cancel: Pick<CancelFlow, "backToAiming">;
  copy: Pick<CopySelection, "execute">;
  paste: Pick<StartPaste, "execute">;
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
    menu: "shape" | "contents" | "utility",
    entryId: string | undefined,
    options: { skipAir?: boolean } = {},
  ): boolean {
    const session = this.repo.get(playerId);
    if (!session) return false;
    const entries =
      menu === "shape"
        ? shapeMenu(session.flow)
        : menu === "contents"
          ? contentsMenu(session.flow)
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
        case "cylinder":
        case "cube":
          this.cases.chooseHeighted.execute({ playerId, kind: entryId });
          break;
        case "cancel":
          this.cases.cancel.backToAiming({ playerId });
          break;
      }
    } else if (menu === "contents") {
      if (entryId === "cancel") this.cases.cancel.backToAiming({ playerId });
      else
        this.cases.confirmHeighted.execute({
          playerId,
          fill: entryId as FillStyle,
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
