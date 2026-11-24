import {
  type BuildEntryId,
  buildMenu,
  contentsMenu,
  type EditEntryId,
  type MenuEntry,
  pasteMenu,
  type RootEntryId,
  shapeChoiceOf,
  shapeMenu,
  stairContentsMenu,
  terraceMenu,
  terrainMenu,
  utilityMenu,
} from "../../domain/build/flow/menu";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import type { PlayerId } from "../../domain/shared/ids";
import type { ChooseBoxStep } from "./chooseBoxStep";
import type { ChooseHeighted } from "./chooseHeighted";
import type { ChooseSideCylinder } from "./chooseSideCylinder";
import type { ChooseStairs } from "./chooseStairs";
import type { ChooseTerrain } from "./chooseTerrain";
import type { ClearSelection } from "./clearSelection";
import type { ConfirmHeighted } from "./confirmHeighted";
import type { ConfirmShape } from "./confirmShape";
import type { ConfirmStairs, ConfirmTerrace } from "./confirmStairs";
import type { ConfirmTerrain } from "./confirmTerrain";
import type { CopySelection } from "./copySelection";
import type { EndPasting } from "./endPasting";
import type { OpenSelectionMenu } from "./openSelectionMenu";
import type { BuildBlockWorld } from "./ports/blocks";
import type { BuildFeedback } from "./ports/feedback";
import type { UndoEdit } from "./undoEdit";

function isOffered<Id extends string>(
  entries: MenuEntry<Id>[],
  entryId: string | undefined,
): entryId is Id {
  return entries.some((entry) => entry.id === entryId);
}

export interface MenuCases {
  openSelectionMenu: Pick<OpenSelectionMenu, "execute">;
  chooseBoxStep: Pick<ChooseBoxStep, "execute">;
  confirmShape: Pick<ConfirmShape, "execute">;
  chooseHeighted: Pick<ChooseHeighted, "execute">;
  chooseSideCylinder: Pick<ChooseSideCylinder, "execute">;
  confirmHeighted: Pick<ConfirmHeighted, "execute">;
  chooseStairs: Pick<ChooseStairs, "execute">;
  confirmTerrace: Pick<ConfirmTerrace, "execute">;
  confirmStairs: Pick<ConfirmStairs, "execute">;
  chooseTerrain: Pick<ChooseTerrain, "execute">;
  confirmTerrain: Pick<ConfirmTerrain, "execute">;
  copy: Pick<CopySelection, "execute">;
  endPasting: Pick<EndPasting, "execute">;
  undo: Pick<UndoEdit, "execute">;
  clear: Pick<ClearSelection, "execute">;
}

export class MenuChoices {
  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly cases: MenuCases,
    private readonly ui: {
      blocks: Pick<BuildBlockWorld, "heightRange">;
      feedback: Pick<BuildFeedback, "showMessage">;
      refresh(playerId: PlayerId, tick: number): void;
    },
  ) {}

  openShapeMenu(playerId: PlayerId, tick: number): MenuEntry<RootEntryId>[] {
    const session = this.repo.get(playerId);
    const flow = session?.flow;
    if (session && flow?.kind === "selected" && flow.menuLevel === "build") {
      session.closeBuildMenu();
      this.ui.refresh(playerId, tick);
    }
    return this.cases.openSelectionMenu.execute({ playerId });
  }

  chooseShape(
    playerId: PlayerId,
    entryId: string | undefined,
    tick: number,
  ): boolean {
    const session = this.repo.get(playerId);
    if (!session) return false;
    const { flow } = session;
    if (!isOffered([...shapeMenu(flow), ...buildMenu(flow)], entryId))
      return false;

    const choice = shapeChoiceOf(entryId);
    switch (choice.kind) {
      case "stairs":
        this.cases.chooseStairs.execute({ playerId, op: choice.op });
        break;
      case "adjustHeight":
        if (
          flow.kind === "selected" &&
          session.adjustHeight(
            this.ui.blocks.heightRange(flow.selection.dimensionId),
          )
        )
          this.ui.feedback.showMessage(playerId, "heightAim");
        break;
      case "openBuild":
        session.openBuildMenu();
        this.ui.refresh(playerId, tick);
        break;
      case "closeBuild":
        session.closeBuildMenu();
        this.ui.refresh(playerId, tick);
        break;
      case "edit":
        this.dispatchEditEntry(choice.id, playerId);
        break;
      case "build":
        this.dispatchBuildEntry(choice.id, playerId);
        break;
      case "cancel":
        this.cases.clear.execute({ playerId });
        break;
      default: {
        const exhaustive: never = choice;
        return exhaustive;
      }
    }
    return true;
  }

  chooseContents(playerId: PlayerId, entryId: string | undefined): boolean {
    const session = this.repo.get(playerId);
    if (!session || !isOffered(contentsMenu(session.flow), entryId))
      return false;
    if (entryId === "cancel") session.backToAiming();
    else this.cases.confirmHeighted.execute({ playerId, fill: entryId });
    return true;
  }

  chooseStairContents(
    playerId: PlayerId,
    entryId: string | undefined,
  ): boolean {
    const session = this.repo.get(playerId);
    if (!session || !isOffered(stairContentsMenu(session.flow), entryId))
      return false;
    if (entryId === "cancel") session.backToAiming();
    else this.cases.confirmStairs.execute({ playerId, contents: entryId });
    return true;
  }

  chooseTerrace(playerId: PlayerId, entryId: string | undefined): boolean {
    const session = this.repo.get(playerId);
    if (!session || !isOffered(terraceMenu(session.flow), entryId))
      return false;
    if (entryId === "cancel") session.backToAiming();
    else this.cases.confirmTerrace.execute({ playerId });
    return true;
  }

  chooseTerrain(playerId: PlayerId, entryId: string | undefined): boolean {
    const session = this.repo.get(playerId);
    if (!session || !isOffered(terrainMenu(session.flow), entryId))
      return false;
    if (entryId === "cancel") session.backToAiming();
    else this.cases.confirmTerrain.execute({ playerId });
    return true;
  }

  chooseUtility(playerId: PlayerId, entryId: string | undefined): boolean {
    const session = this.repo.get(playerId);
    if (!session || !isOffered(utilityMenu(session), entryId)) return false;
    this.cases[entryId].execute({ playerId });
    return true;
  }

  choosePaste(playerId: PlayerId, entryId: string | undefined): boolean {
    const session = this.repo.get(playerId);
    if (session?.flow.kind !== "pasteAim" || !isOffered(pasteMenu(), entryId))
      return false;
    switch (entryId) {
      case "cancel":
        break;
      case "endPaste":
        this.cases.endPasting.execute(playerId);
        break;
      case "newCopy":
        session.startNewCopy();
        break;
      default: {
        const exhaustive: never = entryId;
        return exhaustive;
      }
    }
    return true;
  }

  submitHeight(playerId: PlayerId, height: number): void {
    this.repo.get(playerId)?.setHeight(height);
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
