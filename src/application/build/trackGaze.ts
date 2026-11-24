import type { Facing } from "../../domain/build/rotation/facing";
import type { BuildSession } from "../../domain/build/session";
import type { AimHeight } from "./aimHeight";
import type { AimResult } from "./ports/aim";
import { pasteFacing } from "./resolvePasteTarget";

export class TrackGaze {
  constructor(private readonly aimHeight: AimHeight) {}

  execute(
    session: BuildSession,
    aim: AimResult,
    hasPlayerDimension: boolean,
  ): Facing | undefined {
    if (session.flow.kind === "baseHeight")
      this.aimHeight.execute({ playerId: session.playerId, ray: aim.ray });
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
