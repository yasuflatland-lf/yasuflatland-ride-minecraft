import type { Player } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
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
  type MenuEntry,
  roofMenu,
  shapeMenu,
  utilityMenu,
} from "../../../domain/build/flow/menu";
import { maxRoofHeight } from "../../../domain/build/roof/roof";
import type { BuildSessionRepository } from "../../../domain/build/sessionRepository";
import { BUILD_SPEC } from "../../../domain/build/spec";
import { asPlayerId, type PlayerId } from "../../../domain/shared/ids";
import { BUILD_FORM } from "../identifiers";

export interface BuildMenus {
  showShapeMenu(player: Player): Promise<void>;
  showRoofMenu(player: Player): Promise<void>;
  showUtilityMenu(player: Player): Promise<void>;
  showHeightSlider(player: Player): Promise<void>;
}

interface MenuCases {
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

export class BedrockBuildMenus implements BuildMenus {
  private readonly open = new Set<PlayerId>();

  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly cases: MenuCases,
    private readonly heightSliderFallback: boolean = BUILD_SPEC.heightSliderFallback,
  ) {}

  showShapeMenu(player: Player): Promise<void> {
    return this.exclusive(player, async () => {
      const playerId = asPlayerId(player.id);
      const session = this.repo.get(playerId);
      if (!session) return;
      const id = await this.choose(
        player,
        BUILD_FORM.shapeTitle,
        shapeMenu(session.flow),
      );
      if (!player.isValid) return;
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
          this.cases.chooseRoof.execute({ playerId, kind: id });
          if (this.heightSliderFallback) await this.heightSlider(player);
          break;
        case "cancel":
          this.cases.cancel.backToAiming({ playerId });
      }
    });
  }

  showRoofMenu(player: Player): Promise<void> {
    return this.exclusive(player, () => this.roof(player));
  }

  showHeightSlider(player: Player): Promise<void> {
    return this.exclusive(player, () => this.heightSlider(player));
  }

  showUtilityMenu(player: Player): Promise<void> {
    return this.exclusive(player, async () => {
      const playerId = asPlayerId(player.id);
      const session = this.repo.get(playerId);
      if (!session) return;
      const id = await this.choose(
        player,
        BUILD_FORM.utilityTitle,
        utilityMenu(session),
      );
      if (!player.isValid) return;
      switch (id) {
        case "copy":
        case "undo":
        case "clear":
          this.cases[id].execute({ playerId });
          break;
        case "paste": {
          const answer = await new ModalFormData()
            .title({ translate: BUILD_FORM.paste })
            .toggle({ translate: BUILD_FORM.skipAir }, { defaultValue: false })
            .submitButton({ translate: BUILD_FORM.submit })
            .show(player);
          if (
            !player.isValid ||
            answer.canceled ||
            answer.cancelationReason !== undefined
          )
            return;
          const skipAir = answer.formValues?.[0];
          if (typeof skipAir === "boolean")
            this.cases.paste.execute({ playerId, skipAir });
        }
      }
    });
  }

  private async roof(player: Player): Promise<void> {
    const playerId = asPlayerId(player.id);
    const session = this.repo.get(playerId);
    if (!session) return;
    const id = await this.choose(
      player,
      BUILD_FORM.roofTitle,
      roofMenu(session.flow),
    );
    if (!player.isValid) return;
    if (id === "cancel") this.cases.cancel.backToAiming({ playerId });
    else if (id === "fill" || id === "hollow")
      this.cases.confirmRoof.execute({ playerId, hollow: id === "hollow" });
  }

  private async heightSlider(player: Player): Promise<void> {
    const playerId = asPlayerId(player.id);
    const flow = this.repo.get(playerId)?.flow;
    if (flow?.kind !== "roofHeight") return;
    // A modal cannot update the preview while the player adjusts its slider.
    const answer = await new ModalFormData()
      .title({ translate: BUILD_FORM.roofTitle })
      .slider(
        { translate: BUILD_FORM.height },
        1,
        maxRoofHeight(flow.base, BUILD_SPEC.worldTopY),
        { defaultValue: flow.previous, valueStep: 1 },
      )
      .submitButton({ translate: BUILD_FORM.submit })
      .show(player);
    if (
      !player.isValid ||
      answer.canceled ||
      answer.cancelationReason !== undefined
    )
      return;
    const height = answer.formValues?.[0];
    if (typeof height !== "number") return;
    this.cases.setRoofHeight.execute({ playerId, height });
    await this.roof(player);
  }

  private async choose(
    player: Player,
    title: string,
    entries: MenuEntry[],
  ): Promise<string | undefined> {
    if (entries.length === 0) return undefined;
    const form = new ActionFormData().title({ translate: title });
    for (const { id } of entries)
      form.button({ translate: BUILD_FORM[id as keyof typeof BUILD_FORM] });
    const answer = await form.show(player);
    if (!player.isValid) return undefined;
    if (answer.canceled || answer.cancelationReason !== undefined)
      return "cancel";
    return answer.selection === undefined
      ? undefined
      : entries[answer.selection]?.id;
  }

  private async exclusive(
    player: Player,
    show: () => Promise<void>,
  ): Promise<void> {
    const id = asPlayerId(player.id);
    if (!player.isValid || this.open.has(id)) return;
    this.open.add(id);
    try {
      await show();
    } catch (error: unknown) {
      if (player.isValid) console.warn(`Build menu failed: ${String(error)}`);
    } finally {
      this.open.delete(id);
    }
  }
}
