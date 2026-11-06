import { dominantHorizontalAxis } from "../../domain/build/axis";
import { shapeMenu } from "../../domain/build/flow/menu";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import type { PlayerId } from "../../domain/shared/ids";
import type { ChooseHeighted } from "./chooseHeighted";
import type { AimReader } from "./ports/aim";
import type { BuildFeedback } from "./ports/feedback";

export class ChooseSideCylinder {
  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly feedback: BuildFeedback,
    private readonly aim: AimReader,
    private readonly chooseHeighted: Pick<ChooseHeighted, "execute">,
  ) {}

  execute({ playerId }: { playerId: PlayerId }): void {
    const flow = this.repo.get(playerId)?.flow;
    if (!flow || !shapeMenu(flow).some(({ id }) => id === "sideCylinder")) {
      this.feedback.showMessage(playerId, "noSelection");
      return;
    }
    const direction = this.aim.aim(playerId)?.ray.direction;
    const axis = direction ? dominantHorizontalAxis(direction) : "x";
    this.chooseHeighted.execute({
      playerId,
      kind: axis === "x" ? "sideCylinderX" : "sideCylinderZ",
    });
  }
}
