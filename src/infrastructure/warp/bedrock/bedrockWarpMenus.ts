import type { RawMessage } from "@minecraft/server";
import { FormCancelationReason, ModalFormData } from "@minecraft/server-ui";
import type { WarpMenus } from "../../../application/warp/ports/menus";
import type { PlayerId } from "../../../domain/shared/ids";
import { WARP_SPEC } from "../../../domain/warp/spec";
import { parseWarpName, type WarpName } from "../../../domain/warp/warpName";
import type { WarpPoint } from "../../../domain/warp/warpPoint";
import { chooseFromFormResult } from "../../shared/choiceForm";
import { playerById } from "../../shared/players";
import { WARP_MESSAGE } from "../messages";

// Snapshot validation rejects whitespace-only point IDs, including these controls.
const PREVIOUS_PAGE = "";
const NEXT_PAGE = " ";

function dimensionLabel(dimension: string): RawMessage {
  switch (dimension) {
    case "minecraft:overworld":
      return { translate: WARP_MESSAGE.overworld };
    case "minecraft:nether":
      return { translate: WARP_MESSAGE.nether };
    case "minecraft:the_end":
      return { translate: WARP_MESSAGE.theEnd };
    default:
      return { text: dimension };
  }
}

export function warpLabel(point: WarpPoint, unverified: boolean): RawMessage {
  const { x, y, z } = point.cell;
  return {
    rawtext: [
      { text: `${point.name}\n${point.owner} | ` },
      dimensionLabel(point.dimension),
      { text: ` | ${x} ${y} ${z}` },
      ...(unverified
        ? [{ text: " | " }, { translate: WARP_MESSAGE.unverified }]
        : []),
    ],
  };
}

export class BedrockWarpMenus implements WarpMenus {
  async askName(
    playerId: PlayerId,
    current?: WarpName,
  ): ReturnType<WarpMenus["askName"]> {
    const player = playerById(playerId);
    if (!player?.isValid) return { kind: "cancelled" };
    // Stable server-ui has no text-field length option; parseWarpName enforces the limit.
    const answer = await new ModalFormData()
      .title({ translate: WARP_MESSAGE.nameTitle })
      .textField(
        {
          translate: WARP_MESSAGE.nameLabel,
          with: [String(WARP_SPEC.nameMaxLength)],
        },
        "",
        { defaultValue: current ?? "" },
      )
      .show(player);
    if (!player.isValid) return { kind: "cancelled" };
    if (answer.cancelationReason === FormCancelationReason.UserBusy)
      return { kind: "busy" };
    if (answer.canceled || answer.cancelationReason !== undefined)
      return { kind: "cancelled" };
    const raw = answer.formValues?.[0];
    const name = typeof raw === "string" ? parseWarpName(raw) : undefined;
    return name ? { kind: "name", name } : { kind: "cancelled" };
  }

  async chooseWarp(
    playerId: PlayerId,
    page: Parameters<WarpMenus["chooseWarp"]>[1],
  ): ReturnType<WarpMenus["chooseWarp"]> {
    const player = playerById(playerId);
    if (!player?.isValid) return { kind: "cancelled" };
    const entries: { id: string; label: RawMessage }[] = page.entries.map(
      ({ point, unverified }) => ({
        id: point.id,
        label: warpLabel(point, unverified),
      }),
    );
    if (page.pageIndex > 0)
      entries.push({
        id: PREVIOUS_PAGE,
        label: { translate: WARP_MESSAGE.previousPage },
      });
    if (page.pageIndex < page.pageCount - 1)
      entries.push({
        id: NEXT_PAGE,
        label: { translate: WARP_MESSAGE.nextPage },
      });
    const answer = await chooseFromFormResult(
      player,
      WARP_MESSAGE.listTitle,
      entries,
    );
    if (answer.status === "busy") return { kind: "busy" };
    if (answer.status !== "answered") return { kind: "cancelled" };
    if (answer.choice === PREVIOUS_PAGE)
      return { kind: "page", pageIndex: page.pageIndex - 1 };
    if (answer.choice === NEXT_PAGE)
      return { kind: "page", pageIndex: page.pageIndex + 1 };
    const point = page.entries.find(
      ({ point }) => point.id === answer.choice,
    )?.point;
    return point ? { kind: "warp", id: point.id } : { kind: "cancelled" };
  }
}
