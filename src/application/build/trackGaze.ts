import type { BuildSession } from "../../domain/build/session";
import type { AimResult } from "./ports/aim";
import type { BuildBlockWorld } from "./ports/blocks";

export class TrackGaze {
  constructor(private readonly blocks: Pick<BuildBlockWorld, "heightRange">) {}

  execute(session: BuildSession, aim: AimResult): void {
    const { flow } = session;
    if (flow.kind === "baseHeight")
      session.aimHeight(
        aim.ray,
        this.blocks.heightRange(flow.start.dimensionId),
      );
  }
}
