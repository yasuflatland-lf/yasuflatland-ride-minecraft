import type { PlayerId } from "../../domain/shared/ids";
import type { OccupantEjector } from "./ports/roofTent";
import type { RoofTentOccupantWorld } from "./ports/roofTentOccupant";

export class LeaveRoofTent implements OccupantEjector {
  constructor(private readonly world: RoofTentOccupantWorld) {}

  execute(cmd: { playerId: PlayerId; tentId: string }): void {
    if (this.world.occupantOf(cmd.tentId) === cmd.playerId)
      this.eject(cmd.tentId);
  }

  eject(tentId: string): void {
    const occupant = this.world.occupantOf(tentId);
    if (occupant === undefined) return;
    this.world.placeOutside(occupant, tentId);
    this.world.setOccupant(tentId, undefined);
  }
}
