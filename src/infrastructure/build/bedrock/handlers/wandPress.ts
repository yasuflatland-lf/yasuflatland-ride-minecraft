import { type Player, system } from "@minecraft/server";
import type { AimHeight } from "../../../../application/build/aimHeight";
import type { ConfirmBoxStep } from "../../../../application/build/confirmBoxStep";
import type { FinishRotateMode } from "../../../../application/build/finishRotateMode";
import type { AimReader } from "../../../../application/build/ports/aim";
import type { PressPasteAim } from "../../../../application/build/pressPasteAim";
import type { RotateModeTap } from "../../../../application/build/rotateModeTap";
import type { TapAir } from "../../../../application/build/tapAir";
import { virtualEndPoint } from "../../../../domain/build/aim/aim";
import { routePress } from "../../../../domain/build/flow/press";
import type { BuildSessionRepository } from "../../../../domain/build/sessionRepository";
import { isBoxStepKind } from "../../../../domain/build/volume/kind";
import type { Cell } from "../../../../domain/shared/cells";
import { asDimensionId, type PlayerId } from "../../../../domain/shared/ids";
import type { BuildMenus } from "../buildMenus";

type PressContext = {
  source: Player;
  playerId: PlayerId;
  aim: AimReader;
  repo: BuildSessionRepository;
  pressPasteAim: PressPasteAim;
  rotateModeTap: Pick<RotateModeTap, "execute">;
  finishRotateMode: Pick<FinishRotateMode, "execute">;
  aimHeight: AimHeight;
  confirmBoxStep: Pick<ConfirmBoxStep, "execute">;
  menus: BuildMenus;
  pointOf(playerId: PlayerId): Cell | undefined;
  tapAir: TapAir;
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
  { source, playerId, aimHeight, confirmBoxStep, menus }: PressContext,
  target: Target,
  heightedKind: Parameters<typeof isBoxStepKind>[0],
): void {
  aimHeight.execute({ playerId, ray: target.ray });
  if (isBoxStepKind(heightedKind)) confirmBoxStep.execute({ playerId });
  else void menus.showContentsMenu(source);
}

function airTapPress(
  { source, playerId, repo, pointOf, tapAir, menus }: PressContext,
  target: Target,
): void {
  const before = repo.get(playerId)?.flow.kind;
  const point1 = pointOf(playerId);
  const end = point1 ? virtualEndPoint(point1, target.ray) : undefined;
  tapAir.execute({ playerId, end });
  if (before !== "endpoint" && repo.get(playerId)?.flow.kind === "endpoint")
    system.run(() => {
      if (source.isValid) void menus.showShapeMenu(source);
    });
}

export function dispatchWandPress(context: PressContext): void {
  const { source, playerId, aim, repo, menus } = context;
  const target = aim.aim(playerId);
  const flow = repo.get(playerId)?.flow;
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
    case "finishRotate":
      context.finishRotateMode.execute({ playerId });
      break;
    case "rotateTap":
      context.rotateModeTap.execute({
        playerId,
        dimensionId: asDimensionId(source.dimension.id),
      });
      break;
    case "aimHeight":
      if (target && flow.kind === "heightStep")
        heightStepPress(context, target, flow.heightedKind);
      break;
    case "openUtilityMenu":
      void menus.showUtilityMenu(source);
      break;
    case "fixEndpoint":
      if (target) airTapPress(context, target);
      break;
  }
}
