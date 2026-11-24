import { system, world } from "@minecraft/server";
import {
  acceptsAnyItemUse,
  routePress,
} from "../../../../domain/build/flow/press";
import { cellOf } from "../../../../domain/shared/cells";
import type { Debounces } from "../../../../domain/shared/debounce";
import {
  asDimensionId,
  asPlayerId,
  type PlayerId,
} from "../../../../domain/shared/ids";
import { buildItemRole } from "../../identifiers";
import { heldBuildItem } from "../heldBuildItem";
import {
  type BlockPressContext,
  blockPressIntent,
  pressBlockCell,
  showFollowUp,
} from "./wandPress";

export function registerWand(
  context: BlockPressContext & { pasteDebounce: Debounces<PlayerId> },
): void {
  const { aim, debounce, menus, pasteDebounce, pressWand, repo } = context;
  world.beforeEvents.playerBreakBlock.subscribe((ev) => {
    if (heldBuildItem(ev.player) === "wand") ev.cancel = true;
  });
  world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
    if (heldBuildItem(ev.player) !== "wand") return;
    ev.cancel = true;
    if (!ev.isFirstEvent) return;
    const player = ev.player;
    const playerId = asPlayerId(player.id);
    const flow = repo.get(playerId)?.flow ?? { kind: "idle" };
    const intent = blockPressIntent(flow, player.isSneaking);
    if (intent === "ignore") return;
    // A PC right-click can emit itemUse before the deferred block action runs.
    if (
      (intent === "confirmLiveHeight" || intent === "openUtilityMenu") &&
      acceptsAnyItemUse(flow) &&
      !debounce.press(playerId, system.currentTick)
    )
      return;
    const command = {
      player,
      playerId,
      dimensionId: asDimensionId(ev.block.dimension.id),
      cell: cellOf(ev.block.location),
    };
    system.run(() => pressBlockCell(context, command, intent));
  });
  world.afterEvents.itemUse.subscribe(({ source, itemStack }) => {
    if (!source.isValid || buildItemRole(itemStack.typeId) !== "wand") return;
    const playerId = asPlayerId(source.id);
    // Opening the menu must not swallow the next commit; commits also debounce across anchors.
    const flow = repo.get(playerId)?.flow;
    const tick = system.currentTick;
    const presses =
      source.isSneaking && flow?.kind === "pasteAim" ? pasteDebounce : debounce;
    if (!presses.press(playerId, tick)) return;
    if (!flow) return;
    // FixStairGoal samples its own block hit.
    const target =
      flow.kind === "stairAim" || flow.kind === "stairContents"
        ? undefined
        : aim.aim(playerId);
    const intent = routePress({
      flow,
      role: "wand",
      route: "itemUse",
      target: target ? (target.block ? "block" : "air") : "none",
      sneaking: source.isSneaking,
    }).kind;
    const followUp = pressWand.execute({
      playerId,
      intent,
      dimensionId: asDimensionId(source.dimension.id),
      itemUse: { aim: target, tick, sneaking: source.isSneaking },
    });
    showFollowUp(menus, source, followUp);
  });
}
