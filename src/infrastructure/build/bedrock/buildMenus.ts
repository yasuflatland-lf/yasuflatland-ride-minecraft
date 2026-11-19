import type { Player } from "@minecraft/server";
import { ModalFormData } from "@minecraft/server-ui";
import {
  type BuildMenuEntryId,
  buildMenu,
  type ContentsEntryId,
  contentsMenu,
  type MenuEntry,
  type PasteEntryId,
  pasteMenu,
  type RootEntryId,
  type TerrainEntryId,
  terrainMenu,
  type UtilityEntryId,
  utilityMenu,
} from "../../../domain/build/flow/menu";
import { isRoofKind } from "../../../domain/build/roof/roof";
import type { BuildSessionRepository } from "../../../domain/build/sessionRepository";
import { BUILD_SPEC } from "../../../domain/build/spec";
import {
  removeAboveBox,
  terrainAreaOf,
  terrainSides,
} from "../../../domain/build/terrain/area";
import { volumeOf } from "../../../domain/build/volume/geometry";
import {
  type HeightStepKind,
  isBoxStepKind,
} from "../../../domain/build/volume/kind";
import { asPlayerId } from "../../../domain/shared/ids";
import { chooseFromForm, chooseFromFormResult } from "../../shared/choiceForm";
import { createExclusiveGuard } from "../../shared/exclusiveForm";
import { BUILD_FORM } from "../identifiers";

import { type MenuCases, MenuChoices } from "./menuChoices";

function menuLabel(
  entry: MenuEntry<
    | RootEntryId
    | BuildMenuEntryId
    | ContentsEntryId
    | TerrainEntryId
    | UtilityEntryId
    | PasteEntryId
  >,
): string {
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
  showBuildMenu(player: Player): Promise<void>;
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
    return this.exclusive(player, () => {
      const playerId = asPlayerId(player.id);
      const flow = this.repo.get(playerId)?.flow;
      if (flow?.kind === "selected" && flow.menuLevel === "build")
        this.cases.closeBuildMenu.execute({ playerId });
      return this.shapeMenus(player, "root");
    });
  }

  showBuildMenu(player: Player): Promise<void> {
    return this.exclusive(player, () => this.shapeMenus(player, "build"));
  }

  private async shapeMenus(
    player: Player,
    level: "root" | "build",
  ): Promise<void> {
    const playerId = asPlayerId(player.id);
    while (true) {
      const flow = this.repo.get(playerId)?.flow;
      if (flow?.kind !== "selected" || flow.menuLevel !== level) return;
      const answer = await chooseFromFormResult(
        player,
        level === "root" ? BUILD_FORM.shapeTitle : BUILD_FORM.buildShapeTitle,
        (level === "root"
          ? this.cases.openSelectionMenu.execute({ playerId })
          : buildMenu(flow)
        ).map((entry) => ({
          id: entry.id,
          textKey: menuLabel(entry),
        })),
      );
      if (!player.isValid) return;
      const current = this.repo.get(playerId)?.flow;
      if (current !== flow) return;
      const choice =
        answer.status === "answered"
          ? answer.choice
          : level === "build"
            ? "back"
            : undefined;
      if (!this.choices.choose(playerId, "shape", choice)) return;
      if (choice === "buildShape" || choice === "back") {
        level = choice === "buildShape" ? "build" : "root";
        continue;
      }
      const next = this.repo.get(playerId)?.flow;
      if (next?.kind === "terrainConfirm") await this.terrainConfirm(player);
      if (next?.kind === "heightStep") {
        if (isBoxStepKind(next.heightedKind)) {
          if (!next.heightLocked && this.heightSliderFallback)
            await this.heightSlider(player);
        } else if (next.heightLocked) await this.contents(player);
        else if (this.heightSliderFallback) await this.heightSlider(player);
      }
      return;
    }
  }

  showContentsMenu(player: Player): Promise<void> {
    return this.exclusive(player, () => this.contents(player));
  }

  showHeightSlider(player: Player): Promise<void> {
    return this.exclusive(player, () => this.heightSlider(player));
  }

  showUtilityMenu(player: Player): Promise<void> {
    if (this.repo.get(asPlayerId(player.id))?.flow.kind === "selected")
      return this.showShapeMenu(player);
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
        pasteMenu().map((entry) => ({
          id: entry.id,
          textKey: menuLabel(entry),
        })),
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

  private async terrainConfirm(player: Player): Promise<void> {
    const playerId = asPlayerId(player.id);
    const flow = this.repo.get(playerId)?.flow;
    if (flow?.kind !== "terrainConfirm") return;
    const area = terrainAreaOf(flow.from, flow.to);
    const bottomY = player.dimension.heightRange.min;
    const topY = player.dimension.heightRange.max - 1;
    if (
      flow.op === "removeAbove" &&
      (!removeAboveBox(area) || area.lowerY >= topY)
    ) {
      this.choices.choose(playerId, "terrain", "confirm");
      return;
    }
    const sides = terrainSides(area);
    const id = await chooseFromForm(
      player,
      flow.op === "fillBelow"
        ? BUILD_FORM.fillBelowTitle
        : BUILD_FORM.removeAboveTitle,
      terrainMenu(flow).map((entry) => ({
        id: entry.id,
        textKey: menuLabel(entry),
      })),
      {
        translate:
          flow.op === "fillBelow"
            ? BUILD_FORM.fillBelowBody
            : BUILD_FORM.removeAboveBody,
        with: [
          String(sides.x),
          String(sides.z),
          String(flow.op === "fillBelow" ? bottomY : area.lowerY + 1),
          String(flow.op === "fillBelow" ? area.higherY : topY),
        ],
      },
    );
    if (!player.isValid) return;
    // An unanswered form must not leave the flow here, since taps do nothing in this state.
    this.choices.choose(playerId, "terrain", id ?? "cancel");
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
