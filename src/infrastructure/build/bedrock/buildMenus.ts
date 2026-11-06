import type { Player } from "@minecraft/server";
import { ModalFormData } from "@minecraft/server-ui";
import {
  type ContentsEntryId,
  contentsMenu,
  type MenuEntry,
  type PasteEntryId,
  pasteMenu,
  type ShapeEntryId,
  shapeMenu,
  type UtilityEntryId,
  utilityMenu,
} from "../../../domain/build/flow/menu";
import { isRoofKind } from "../../../domain/build/roof/roof";
import type { BuildSessionRepository } from "../../../domain/build/sessionRepository";
import { BUILD_SPEC } from "../../../domain/build/spec";
import { volumeOf } from "../../../domain/build/volume/geometry";
import {
  type HeightStepKind,
  isBoxStepKind,
} from "../../../domain/build/volume/kind";
import { asPlayerId } from "../../../domain/shared/ids";
import { chooseFromForm } from "../../shared/choiceForm";
import { createExclusiveGuard } from "../../shared/exclusiveForm";
import { BUILD_FORM } from "../identifiers";

import { type MenuCases, MenuChoices } from "./menuChoices";

function menuLabel(
  entry: MenuEntry<
    ShapeEntryId | ContentsEntryId | UtilityEntryId | PasteEntryId
  >,
): string {
  if (entry.id === "skipAir")
    return entry.on ? BUILD_FORM.skipAirOn : BUILD_FORM.skipAirOff;
  return BUILD_FORM[entry.id];
}

function heightSliderTitle(kind: HeightStepKind): string {
  switch (kind) {
    case "cut":
      return BUILD_FORM.cutTitle;
    case "copy":
      return BUILD_FORM.copyTitle;
    default:
      return isRoofKind(kind) ? BUILD_FORM.roofTitle : BUILD_FORM.solidTitle;
  }
}

export interface BuildMenus {
  showShapeMenu(player: Player): Promise<void>;
  showContentsMenu(player: Player): Promise<void>;
  showUtilityMenu(player: Player): Promise<void>;
  showPasteMenu(player: Player): Promise<void>;
  showHeightSlider(player: Player): Promise<void>;
}

export class BedrockBuildMenus implements BuildMenus {
  private readonly exclusive = createExclusiveGuard("Build menu");

  private readonly choices: MenuChoices;

  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly cases: MenuCases,
    private readonly heightSliderFallback: boolean = BUILD_SPEC.heightSliderFallback,
  ) {
    this.choices = new MenuChoices(repo, cases);
  }

  showShapeMenu(player: Player): Promise<void> {
    return this.exclusive(player, async () => {
      const playerId = asPlayerId(player.id);
      const session = this.repo.get(playerId);
      if (!session) return;
      const id = await chooseFromForm(
        player,
        BUILD_FORM.shapeTitle,
        shapeMenu(session.flow).map((entry) => ({
          id: entry.id,
          textKey: menuLabel(entry),
        })),
      );
      if (!player.isValid) return;
      const offered = this.choices.choose(playerId, "shape", id);
      const flow = this.repo.get(playerId)?.flow;
      if (offered && flow?.kind === "heightStep") {
        if (isBoxStepKind(flow.heightedKind)) {
          if (!flow.heightLocked && this.heightSliderFallback)
            await this.heightSlider(player);
        } else if (flow.heightLocked) await this.contents(player);
        else if (this.heightSliderFallback) await this.heightSlider(player);
      }
    });
  }

  showContentsMenu(player: Player): Promise<void> {
    return this.exclusive(player, () => this.contents(player));
  }

  showHeightSlider(player: Player): Promise<void> {
    return this.exclusive(player, () => this.heightSlider(player));
  }

  showUtilityMenu(player: Player): Promise<void> {
    return this.exclusive(player, async () => {
      const playerId = asPlayerId(player.id);
      const session = this.repo.get(playerId);
      if (!session) return;
      const id = await chooseFromForm(
        player,
        BUILD_FORM.utilityTitle,
        utilityMenu(session).map((entry) => ({
          id: entry.id,
          textKey: menuLabel(entry),
        })),
      );
      if (!player.isValid) return;
      this.choices.choose(playerId, "utility", id);
    });
  }

  showPasteMenu(player: Player): Promise<void> {
    return this.exclusive(player, async () => {
      const playerId = asPlayerId(player.id);
      const session = this.repo.get(playerId);
      if (session?.flow.kind !== "pasteAim") return;
      const id = await chooseFromForm(
        player,
        BUILD_FORM.utilityTitle,
        pasteMenu({
          hasHistory: session.hasHistory,
          skipAir: session.flow.kind === "pasteAim" && session.flow.skipAir,
        }).map((entry) => ({ id: entry.id, textKey: menuLabel(entry) })),
      );
      if (player.isValid) this.choices.choose(playerId, "paste", id);
    });
  }

  private async contents(player: Player): Promise<void> {
    const playerId = asPlayerId(player.id);
    const session = this.repo.get(playerId);
    if (
      session?.flow.kind !== "heightStep" ||
      isBoxStepKind(session.flow.heightedKind)
    )
      return;
    const id = await chooseFromForm(
      player,
      isRoofKind(session.flow.heightedKind)
        ? BUILD_FORM.roofTitle
        : BUILD_FORM.solidTitle,
      contentsMenu(session.flow).map((entry) => ({
        id: entry.id,
        textKey: menuLabel(entry),
      })),
    );
    if (!player.isValid) return;
    this.choices.choose(playerId, "contents", id);
  }

  private async heightSlider(player: Player): Promise<void> {
    const playerId = asPlayerId(player.id);
    const flow = this.repo.get(playerId)?.flow;
    if (flow?.kind !== "heightStep") return;
    if (flow.heightLocked) {
      if (!isBoxStepKind(flow.heightedKind)) await this.contents(player);
      return;
    }
    // A modal cannot update the preview while the player adjusts its slider.
    const answer = await new ModalFormData()
      .title({
        translate: heightSliderTitle(flow.heightedKind),
      })
      .slider(
        { translate: BUILD_FORM.height },
        1,
        volumeOf(flow.heightedKind).maxHeight(flow.base, BUILD_SPEC.worldTopY),
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
    this.cases.setHeight.execute({ playerId, height });
    if (isBoxStepKind(flow.heightedKind))
      this.cases.confirmBoxStep.execute({ playerId });
    else await this.contents(player);
  }
}
