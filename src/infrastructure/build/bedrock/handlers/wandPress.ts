import type { Player } from "@minecraft/server";
import type {
  FollowUp,
  PressWand,
} from "../../../../application/build/pressWand";
import type { Ray } from "../../../../domain/build/aim/aim";
import type { BlockTap } from "../../../../domain/build/blockTap";
import {
  type PressIntent,
  routePress,
} from "../../../../domain/build/flow/press";
import type { BuildFlow } from "../../../../domain/build/flow/state";
import type { BuildSessionRepository } from "../../../../domain/build/sessionRepository";
import type { PlayerId } from "../../../../domain/shared/ids";
import type { BuildMenus } from "../buildMenus";

export type BlockPressContext = {
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
  { menus, repo, pressWand }: BlockPressContext,
  {
    player,
    playerId,
    tap,
    ray,
    quietTicks,
  }: {
    player: Player;
    playerId: PlayerId;
    tap: BlockTap;
    ray?: Ray;
    quietTicks?: number;
  },
  intent: PressIntent["kind"],
): void {
  if (!player.isValid) return;
  if (blockPressIntent(repo.get(playerId)?.flow, player.isSneaking) !== intent)
    return;
  showFollowUp(
    menus,
    player,
    pressWand.execute({ playerId, intent, tap, ray, quietTicks }),
  );
}
