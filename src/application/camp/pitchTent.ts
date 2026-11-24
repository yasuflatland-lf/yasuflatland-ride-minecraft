// Use case: pitch a tent from its item on the top of a block (ADR 0131).
import { planPitch, tentGround, tentPose } from "../../domain/camp/tent";
import type { DimensionId, PlayerId } from "../../domain/shared/ids";
import type { Vec3 } from "../../domain/shared/vec";
import { placePaid } from "../shared/paidPlacement";
import type { TentWorld } from "./ports/tent";

export interface PitchTentCommand {
  /** Undefined for the test event: nothing is consumed and no message is shown. */
  playerId?: PlayerId;
  dimensionId: DimensionId;
  /** The block whose top face was clicked (integer coordinates); a decoration on the ground is stepped through. */
  clicked: Vec3;
  /** The player's yaw; the tent opens toward them. */
  yaw: number;
  slot: number;
}

export class PitchTent {
  constructor(private readonly world: TentWorld) {}

  /** Read-only, for a before-event: false when `clicked` is one of our blocks, so the press goes to that block. */
  accepts(dimensionId: DimensionId, clicked: Vec3): boolean {
    return !this.world.isOwnBlock(dimensionId, clicked);
  }

  /** Returns whether a tent was pitched. */
  execute(cmd: PitchTentCommand): boolean {
    // The survey, the check, and the lay run in one call, so nothing in the
    // world can change between them.
    const ground = tentGround(cmd.clicked, (at) =>
      this.world.typeIdAt(cmd.dimensionId, at),
    );
    const pose = tentPose(ground, cmd.yaw);
    const plan = planPitch(pose, this.world.survey(cmd.dimensionId, pose));
    const { playerId } = cmd;
    if (!plan.ok) {
      if (playerId !== undefined)
        this.world.showPitchRefusal(playerId, plan.reason);
      return false;
    }
    const result = placePaid(
      this.world,
      { player: playerId, slot: cmd.slot },
      () => {
        this.world.clearDecorations(cmd.dimensionId, plan.clearTopFirst);
        return this.world.pitch(cmd.dimensionId, pose);
      },
    );
    return result.placed;
  }
}
