import type { RoofTentId } from "../../domain/camp/ids";
import { enter } from "../../domain/camp/roofTent/occupancy";
import type { PlayerId } from "../../domain/shared/ids";
import type { RoofTentOccupantWorld } from "./ports/roofTentOccupant";

export class EnterRoofTent {
  constructor(private readonly world: RoofTentOccupantWorld) {}

  execute(cmd: { playerId: PlayerId; tentId: RoofTentId }): boolean {
    const occupant = this.world.occupantOf(cmd.tentId);
    if (
      enter({ occupant }, cmd.playerId) === undefined &&
      occupant !== cmd.playerId
    ) {
      this.world.showMessage(cmd.playerId, "tent_occupied");
      return false;
    }
    this.world.setOccupant(cmd.tentId, cmd.playerId);
    this.world.moveInside(cmd.playerId, cmd.tentId);
    this.world.conceal(cmd.playerId);
    return true;
  }
}
