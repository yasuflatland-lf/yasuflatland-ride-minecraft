import type { Facing } from "../../domain/build/rotation/facing";
import type { BuildSession } from "../../domain/build/session";
import type { AimResult } from "./ports/aim";
import type { BuildBlockWorld } from "./ports/blocks";
import { pasteFacing } from "./resolvePasteTarget";

export class TrackGaze {
  constructor(private readonly blocks: Pick<BuildBlockWorld, "heightRange">) {}

  execute(
    session: BuildSession,
    aim: AimResult,
    hasPlayerDimension: boolean,
  ): Facing | undefined {
    const { flow } = session;
    if (flow.kind === "baseHeight")
      session.aimHeight(
        aim.ray,
        this.blocks.heightRange(flow.start.dimensionId),
      );
    else if (hasPlayerDimension) return trackPasteFacing(session, aim);
    return undefined;
  }
}

export function trackPasteFacing(
  session: BuildSession,
  aim: AimResult,
  facing?: Facing,
): Facing | undefined {
  const { flow, clipboard } = session;
  if (flow.kind !== "pasteAim" || !clipboard) return;
  const next =
    facing ?? pasteFacing(clipboard.facing, flow.facing, aim.ray.direction);
  if (next !== flow.facing) session.followPasteFacing(next);
  return next;
}
