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
  stairContentsMenu,
  type TerrainEntryId,
  terraceMenu,
  terrainMenu,
  type UtilityEntryId,
  utilityMenu,
} from "../../../domain/build/flow/menu";
import { isRoofKind } from "../../../domain/build/roof/roof";
import type { BuildSessionRepository } from "../../../domain/build/sessionRepository";
import { BUILD_SPEC } from "../../../domain/build/spec";
import {
  type StairContents,
  type StairOp,
  TERRACE_ROLES,
} from "../../../domain/build/stairs/contents";
import { stairCellCount } from "../../../domain/build/stairs/roles";
import {
  removeAboveBox,
  terrainAreaOf,
  terrainSides,
} from "../../../domain/build/terrain/area";
import { volumeOf } from "../../../domain/build/volume/geometry";
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

const stairLabels = {
  passage: BUILD_FORM.stairPassage,
  fillBelow: BUILD_FORM.stairFillBelow,
  stepsOnly: BUILD_FORM.stepsOnly,
  cancel: BUILD_FORM.cancel,
} satisfies Record<StairContents | "cancel", string>;

export interface BuildMenus {
  showContentsMenu(player: Player): Promise<void>;
  showStairContentsMenu(player: Player): Promise<void>;
  showTerraceMenu(player: Player): Promise<void>;
  showUtilityMenu(player: Player): Promise<void>;
  showPasteMenu(player: Player): Promise<void>;
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

  private async shapeMenus(
    player: Player,
    level: "root" | "build",
  ): Promise<void> {
    const playerId = asPlayerId(player.id);
    while (true) {
      const flow = this.repo.get(playerId)?.flow;
      if (flow?.kind !== "selected" || flow.menuLevel !== level) return;
      const entries =
        level === "root"
          ? this.cases.openSelectionMenu.execute({ playerId })
          : buildMenu(flow);
      const opened = this.repo.get(playerId)?.flow;
      const answer = await chooseFromFormResult(
        player,
        level === "root" ? BUILD_FORM.shapeTitle : BUILD_FORM.buildShapeTitle,
        entries.map((entry) => ({
          id: entry.id,
          textKey: menuLabel(entry),
        })),
      );
      if (!player.isValid) return;
      const current = this.repo.get(playerId)?.flow;
      if (current !== opened) return;
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
        if (next.heightLocked) await this.contents(player);
        else if (this.heightSliderFallback) await this.heightSlider(player);
      }
      return;
    }
  }

  showContentsMenu(player: Player): Promise<void> {
    return this.exclusive(player, () => this.contents(player));
  }

  showStairContentsMenu(player: Player): Promise<void> {
    return this.stairForm(player, "stairs");
  }

  showTerraceMenu(player: Player): Promise<void> {
    return this.stairForm(player, "terrace");
  }

  private stairForm(player: Player, op: StairOp): Promise<void> {
    return this.exclusive(player, async () => {
      const playerId = asPlayerId(player.id);
      const flow = this.repo.get(playerId)?.flow;
      if (flow?.kind !== "stairContents" || flow.op !== op) return;
      const terrace = op === "terrace";
      let id: StairContents | "confirm" | "cancel" | undefined;
      try {
        id = await chooseFromForm(
          player,
          terrace ? BUILD_FORM.terraceTitle : BUILD_FORM.stairContentsTitle,
          terrace
            ? terraceMenu(flow).map((entry) => ({
                id: entry.id,
                textKey: menuLabel(entry),
              }))
            : stairContentsMenu(flow).map(({ id }) => ({
                id,
                textKey: stairLabels[id],
              })),
          terrace
            ? {
                translate: BUILD_FORM.terraceBody,
                with: [String(stairCellCount(flow.staircase, TERRACE_ROLES))],
              }
            : undefined,
        );
      } finally {
        if (player.isValid && this.repo.get(playerId)?.flow === flow) {
          this.choices.choose(
            playerId,
            terrace ? "terrace" : "stairContents",
            id ?? "cancel",
          );
          // A refused edit leaves the fixed goal in place, but the form has closed.
          if (this.repo.get(playerId)?.flow === flow)
            this.cases.cancel.backToAiming({ playerId });
        }
      }
    });
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
    if (session?.flow.kind !== "heightStep") return;
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
    const area = terrainAreaOf(flow.selection.box, flow.from, flow.to);
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
      await this.contents(player);
      return;
    }
    // A modal cannot update the preview while the player adjusts its slider.
    const answer = await new ModalFormData()
      .title({
        translate: isRoofKind(flow.heightedKind)
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
    await this.contents(player);
  }
}
