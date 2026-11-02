import type { PlayerId } from "../../domain/shared/ids";
import type { LeaveRoofTent } from "./leaveRoofTent";
import type { RoofTentOccupantWorld } from "./ports/roofTentOccupant";
import type { SleepInRoofTent } from "./sleepInRoofTent";

export const ROOF_TENT_CHOICES = ["sleep", "exit"] as const;

export class RoofTentMenu {
  constructor(
    private readonly world: RoofTentOccupantWorld,
    private readonly sleep: SleepInRoofTent,
    private readonly leave: LeaveRoofTent,
  ) {}

  entries(): typeof ROOF_TENT_CHOICES {
    return ROOF_TENT_CHOICES;
  }

  choose(
    cmd: { playerId: PlayerId; tentId: string },
    choice: (typeof ROOF_TENT_CHOICES)[number],
  ): void {
    if (this.world.occupantOf(cmd.tentId) !== cmd.playerId) return;
    if (choice === "sleep") this.sleep.execute(cmd);
    else this.leave.execute(cmd);
  }
}
