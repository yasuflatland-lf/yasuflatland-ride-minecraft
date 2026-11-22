import { type Player, system } from "@minecraft/server";
import type { AimHeight } from "../../../../application/build/aimHeight";
import type { ConfirmLiveHeight } from "../../../../application/build/confirmLiveHeight";
import type { FixStairGoal } from "../../../../application/build/fixStairGoal";
import type { AimReader } from "../../../../application/build/ports/aim";
import type { PressPasteAim } from "../../../../application/build/pressPasteAim";
import type { SetPoint } from "../../../../application/build/setPoint";
import type { TapAir } from "../../../../application/build/tapAir";
import { virtualAimedEndPoint } from "../../../../domain/build/aim/endPoint";
import {
  type PressIntent,
  routePress,
} from "../../../../domain/build/flow/press";
import type { BuildSessionRepository } from "../../../../domain/build/sessionRepository";
import type { StairOp } from "../../../../domain/build/stairs/contents";
import type { Cell } from "../../../../domain/shared/cells";
import type { Debounces } from "../../../../domain/shared/debounce";
import {
  asDimensionId,
  asPlayerId,
  type DimensionId,
  type PlayerId,
} from "../../../../domain/shared/ids";
import type { BuildMenus } from "../buildMenus";

type PressContext = {
  source: Player;
  playerId: PlayerId;
  aim: AimReader;
  repo: BuildSessionRepository;
  pressPasteAim: PressPasteAim;
  aimHeight: AimHeight;
  confirmLiveHeight: ConfirmLiveHeight;
  fixStairGoal: FixStairGoal;
  menus: BuildMenus;
  pointOf(playerId: PlayerId): Cell | undefined;
  tapAir: TapAir;
};
export type BlockPressContext = {
  aim: AimReader;
  aimHeight: AimHeight;
  confirmLiveHeight: ConfirmLiveHeight;
  debounce: Debounces<PlayerId>;
  fixStairGoal: FixStairGoal;
  menus: BuildMenus;
  repo: BuildSessionRepository;
  setPoint: SetPoint;
};
type Target = NonNullable<ReturnType<AimReader["aim"]>>;

function pasteAimPress(
  { source, playerId, pressPasteAim, menus }: PressContext,
  target: Target | undefined,
): void {
  const result = pressPasteAim.execute({
    playerId,
    dimensionId: asDimensionId(source.dimension.id),
    aim: target,
    tick: system.currentTick,
    sneaking: source.isSneaking,
  });
  if (result === "menu") void menus.showPasteMenu(source);
}

function heightStepPress(
  { source, playerId, aimHeight, menus }: PressContext,
  target: Target,
): void {
  aimHeight.execute({ playerId, ray: target.ray });
  void menus.showContentsMenu(source);
}

function airTapPress(
  { playerId, pointOf, tapAir }: PressContext,
  target: Target,
): void {
  const point1 = pointOf(playerId);
  const end = point1 ? virtualAimedEndPoint(point1, target) : undefined;
  tapAir.execute({ playerId, end });
}

function pressStairGoal(
  player: Player,
  op: StairOp,
  fix: FixStairGoal,
  menus: BuildMenus,
): void {
  if (!fix.execute({ playerId: asPlayerId(player.id) })) return;
  if (op === "terrace") void menus.showTerraceMenu(player);
  else void menus.showStairContentsMenu(player);
}

export function pressBlockCell(
  {
    aim,
    aimHeight,
    confirmLiveHeight,
    debounce,
    fixStairGoal,
    menus,
    repo,
    setPoint,
  }: BlockPressContext,
  {
    player,
    playerId,
    dimensionId,
    cell,
  }: {
    player: Player;
    playerId: PlayerId;
    dimensionId: DimensionId;
    cell: Cell;
  },
  intent: PressIntent["kind"],
): void {
  if (!player.isValid) return;
  const flow = repo.get(playerId)?.flow ?? { kind: "idle" };
  if (
    routePress({
      flow,
      role: "wand",
      route: "blockInteract",
      target: "block",
      sneaking: player.isSneaking,
    }).kind !== intent
  )
    return;
  switch (intent) {
    case "confirmLiveHeight": {
      const target = aim.aim(playerId);
      if (!target) return;
      aimHeight.execute({ playerId, ray: target.ray });
      if (confirmLiveHeight.execute({ playerId }))
        void menus.showUtilityMenu(player);
      break;
    }
    case "fixStairGoal":
      if (
        flow.kind === "stairAim" &&
        debounce.press(playerId, system.currentTick)
      )
        pressStairGoal(player, flow.op, fixStairGoal, menus);
      break;
    case "aimHeight": {
      if (flow.kind !== "heightStep") return;
      const target = aim.aim(playerId);
      if (!target) return;
      aimHeight.execute({ playerId, ray: target.ray });
      void menus.showContentsMenu(player);
      break;
    }
    case "selectPoint":
      setPoint.execute({ playerId, dimensionId, cell });
      break;
    case "openUtilityMenu":
      void menus.showUtilityMenu(player);
      break;
  }
}

export function dispatchWandPress(context: PressContext): void {
  const { source, playerId, aim, repo, menus } = context;
  const flow = repo.get(playerId)?.flow;
  const target =
    flow?.kind === "stairAim" || flow?.kind === "stairContents"
      ? undefined
      : aim.aim(playerId);
  if (!flow) {
    // TapAir already handles a missing session without offering idle utilities.
    if (target && !target.block) airTapPress(context, target);
    return;
  }
  const intent = routePress({
    flow,
    role: "wand",
    route: "itemUse",
    target: target ? (target.block ? "block" : "air") : "none",
    sneaking: source.isSneaking,
  });
  switch (intent.kind) {
    case "pasteAim":
      pasteAimPress(context, target);
      break;
    case "confirmLiveHeight":
      if (target) {
        context.aimHeight.execute({ playerId, ray: target.ray });
        if (context.confirmLiveHeight.execute({ playerId }))
          void menus.showUtilityMenu(source);
      }
      break;
    case "fixStairGoal":
      if (flow.kind === "stairAim")
        pressStairGoal(source, flow.op, context.fixStairGoal, menus);
      break;
    case "aimHeight":
      if (target && flow.kind === "heightStep")
        heightStepPress(context, target);
      break;
    case "openUtilityMenu":
      void menus.showUtilityMenu(source);
      break;
    case "fixEndpoint":
      if (target) airTapPress(context, target);
      break;
  }
}
