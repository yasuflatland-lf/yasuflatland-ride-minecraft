import { type Player, system } from "@minecraft/server";
import type { AimReader } from "../../../../application/build/ports/aim";
import type {
  FollowUp,
  PressWand,
} from "../../../../application/build/pressWand";
import type { BlockTap } from "../../../../domain/build/blockTap";
import {
  type PressIntent,
  routePress,
} from "../../../../domain/build/flow/press";
import type { BuildFlow } from "../../../../domain/build/flow/state";
import type { BuildSessionRepository } from "../../../../domain/build/sessionRepository";
import type { Debounces } from "../../../../domain/shared/debounce";
import type { PlayerId } from "../../../../domain/shared/ids";
import type { BuildMenus } from "../buildMenus";

export type BlockPressContext = {
  aim: AimReader;
  debounce: Debounces<PlayerId>;
  menus: BuildMenus;
  repo: BuildSessionRepository;
  pressWand: PressWand;
};

const forms = {
  utilityMenu: "showUtilityMenu",
  contentsMenu: "showContentsMenu",
  stairContents: "showStairContentsMenu",
  terraceMenu: "showTerraceMenu",
  pasteMenu: "showPasteMenu",
} as const satisfies Record<Exclude<FollowUp, "none">, keyof BuildMenus>;

export function showFollowUp(
  menus: BuildMenus,
  player: Player,
  followUp: FollowUp,
): void {
  if (followUp !== "none") void menus[forms[followUp]](player);
}

export function blockPressIntent(
  flow: BuildFlow | undefined,
  sneaking: boolean,
): PressIntent["kind"] {
  return routePress({
    flow: flow ?? { kind: "idle" },
    role: "wand",
    route: "blockInteract",
    target: "block",
    sneaking,
  }).kind;
}

export function pressBlockCell(
  { aim, debounce, menus, repo, pressWand }: BlockPressContext,
  {
    player,
    playerId,
    tap,
  }: {
    player: Player;
    playerId: PlayerId;
    tap: BlockTap;
  },
  intent: PressIntent["kind"],
): void {
  if (!player.isValid) return;
  if (blockPressIntent(repo.get(playerId)?.flow, player.isSneaking) !== intent)
    return;
  if (
    intent === "fixStairGoal" &&
    !debounce.press(playerId, system.currentTick)
  )
    return;
  const ray =
    intent === "aimHeight" || intent === "confirmLiveHeight"
      ? aim.aim(playerId)?.ray
      : undefined;
  showFollowUp(
    menus,
    player,
    pressWand.execute({ playerId, intent, tap, ray }),
  );
}
