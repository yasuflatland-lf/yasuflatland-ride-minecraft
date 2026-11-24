import { aimedEndPoint } from "../../domain/build/aim/endPoint";
import type { AimSample } from "../../domain/build/aim/sample";
import type { BuildFlow } from "../../domain/build/flow/state";
import { tapTargetCell } from "../../domain/build/tapTarget";
import type { DimensionId, PlayerId } from "../../domain/shared/ids";
import type { BuildBlockWorld } from "./ports/blocks";
import type { TapTargets } from "./ports/tapTargets";

export class SyncTapTarget {
  constructor(
    private readonly blocks: Pick<BuildBlockWorld, "isAir" | "heightRange">,
    private readonly targets: TapTargets,
  ) {}

  execute({
    playerId,
    inBuildMode,
    flow,
    aim,
    dimensionId,
  }: {
    playerId: PlayerId;
    inBuildMode: boolean;
    flow: BuildFlow | undefined;
    aim: AimSample | undefined;
    dimensionId: DimensionId | undefined;
  }): void {
    if (inBuildMode && flow && aim?.input === "touch" && dimensionId) {
      const end =
        flow.kind === "point1"
          ? aimedEndPoint(
              flow.start.cell,
              aim,
              this.blocks.heightRange(flow.start.dimensionId),
            )
          : undefined;
      const cell = tapTargetCell(flow, end);
      if (cell && this.blocks.isAir(dimensionId, cell)) {
        this.targets.show(playerId, { dimensionId, cell });
        return;
      }
    }
    this.targets.hide(playerId);
  }
}
