import type { ChairMenuChoice } from "../../domain/resort/beachChair";
import type { BeachChairId } from "../../domain/resort/ids";
import type { PlayerId } from "../../domain/shared/ids";
import type { SwitchBeachChairForm } from "./switchBeachChairForm";

export class BeachChairMenu {
  constructor(
    private readonly form: SwitchBeachChairForm,
    private readonly lieDown: (cmd: {
      id: BeachChairId;
      player: PlayerId;
    }) => void,
  ) {}
  choose(
    choice: ChairMenuChoice,
    cmd: { id: BeachChairId; player: PlayerId },
  ): void {
    if (choice === "fold") this.form.fold(cmd);
    else this.lieDown(cmd);
  }
}
