import type { Player } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import {
  type ContentsEntryId,
  contentsMenu,
  type MenuEntry,
  type ShapeEntryId,
  shapeMenu,
  type UtilityEntryId,
  utilityMenu,
} from "../../../domain/build/flow/menu";
import { isRoofKind } from "../../../domain/build/roof/roof";
import type { BuildSessionRepository } from "../../../domain/build/sessionRepository";
import { BUILD_SPEC } from "../../../domain/build/spec";
import { volumeOf } from "../../../domain/build/volume/geometry";
import { asPlayerId, type PlayerId } from "../../../domain/shared/ids";
import { BUILD_FORM } from "../identifiers";

import { type MenuCases, MenuChoices } from "./menuChoices";

const MENU_LABELS: Record<
  ShapeEntryId | ContentsEntryId | UtilityEntryId,
  keyof typeof BUILD_FORM
> = {
  place: "place",
  fill: "fill",
  frame: "frame",
  faces: "faces",
  walls: "walls",
  gable: "gable",
  hip: "hip",
  cylinder: "cylinder",
  cube: "cube",
  cancel: "cancel",
  hollow: "hollow",
  tube: "tube",
  copy: "copy",
  paste: "paste",
  undo: "undo",
  clear: "clear",
  stopPaste: "stopPaste",
};

export interface BuildMenus {
  showShapeMenu(player: Player): Promise<void>;
  showContentsMenu(player: Player): Promise<void>;
  showUtilityMenu(player: Player): Promise<void>;
  showHeightSlider(player: Player): Promise<void>;
}

export class BedrockBuildMenus implements BuildMenus {
  private readonly open = new Set<PlayerId>();

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
      const id = await this.choose(
        player,
        BUILD_FORM.shapeTitle,
        shapeMenu(session.flow),
      );
      if (!player.isValid) return;
      const offered = this.choices.choose(playerId, "shape", id);
      const flow = this.repo.get(playerId)?.flow;
      if (offered && flow?.kind === "heightStep") {
        if (flow.heightedKind === "copy") {
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
      const id = await this.choose(
        player,
        BUILD_FORM.utilityTitle,
        utilityMenu(session),
      );
      if (!player.isValid) return;
      if (id === "paste") {
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
          this.choices.choose(playerId, "utility", id, { skipAir });
      } else this.choices.choose(playerId, "utility", id);
    });
  }

  private async contents(player: Player): Promise<void> {
    const playerId = asPlayerId(player.id);
    const session = this.repo.get(playerId);
    if (
      session?.flow.kind !== "heightStep" ||
      session.flow.heightedKind === "copy"
    )
      return;
    const id = await this.choose(
      player,
      isRoofKind(session.flow.heightedKind)
        ? BUILD_FORM.roofTitle
        : BUILD_FORM.solidTitle,
      contentsMenu(session.flow),
    );
    if (!player.isValid) return;
    this.choices.choose(playerId, "contents", id);
  }

  private async heightSlider(player: Player): Promise<void> {
    const playerId = asPlayerId(player.id);
    const flow = this.repo.get(playerId)?.flow;
    if (flow?.kind !== "heightStep") return;
    if (flow.heightLocked) {
      if (flow.heightedKind !== "copy") await this.contents(player);
      return;
    }
    // A modal cannot update the preview while the player adjusts its slider.
    const answer = await new ModalFormData()
      .title({
        translate:
          flow.heightedKind === "copy"
            ? BUILD_FORM.copyTitle
            : isRoofKind(flow.heightedKind)
              ? BUILD_FORM.roofTitle
              : BUILD_FORM.solidTitle,
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
    if (flow.heightedKind === "copy")
      this.cases.confirmCopyHeight.execute({ playerId });
    else await this.contents(player);
  }

  private async choose(
    player: Player,
    title: string,
    entries: MenuEntry<ShapeEntryId | ContentsEntryId | UtilityEntryId>[],
  ): Promise<string | undefined> {
    if (entries.length === 0) return undefined;
    const form = new ActionFormData().title({ translate: title });
    for (const { id } of entries)
      form.button({ translate: BUILD_FORM[MENU_LABELS[id]] });
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
