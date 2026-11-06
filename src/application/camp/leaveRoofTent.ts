import type { RoofTentId } from "../../domain/camp/ids";
import { leave } from "../../domain/camp/roofTent/occupancy";
import type { PlayerId } from "../../domain/shared/ids";
import type { OccupantEjector } from "./ports/roofTent";
import type { RoofTentOccupantWorld } from "./ports/roofTentOccupant";

export class LeaveRoofTent implements OccupantEjector {
  constructor(private readonly world: RoofTentOccupantWorld) {}

  execute(cmd: { playerId: PlayerId; tentId: RoofTentId }): void {
    const occupant = this.world.occupantOf(cmd.tentId);
    if (leave({ occupant }, cmd.playerId).occupant !== occupant)
      this.eject(cmd.tentId);
  }

  eject(tentId: RoofTentId): void {
    const occupant = this.world.occupantOf(tentId);
    if (occupant === undefined) return;
    this.world.placeOutside(occupant, tentId);
    this.world.reveal(occupant);
    this.world.setOccupant(tentId, undefined);
  }
}
