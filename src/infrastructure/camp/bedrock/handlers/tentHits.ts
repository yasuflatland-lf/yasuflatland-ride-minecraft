import type { PaintTent } from "../../../../application/camp/paintTent";
import type { TakeDownTent } from "../../../../application/camp/takeDownTent";
import { asTentId, type TentId } from "../../../../domain/camp/tent";
import type { DimensionId } from "../../../../domain/shared/ids";
import type { Vec3 } from "../../../../domain/shared/vec";
import { subscribeGearHits } from "../../../shared/gearHits";
import { TENT_TYPE } from "../../identifiers";

export function registerTentHits(
  takeDown: TakeDownTent,
  paintTent: PaintTent,
  owner: (
    dimensionId: DimensionId,
    cell: Vec3,
    typeId: string,
  ) => TentId | undefined,
): void {
  subscribeGearHits({
    idOf: (entity) =>
      entity.typeId === TENT_TYPE ? asTentId(entity.id) : undefined,
    ownerOfBlock: owner,
    onDye: ({ id, player, tick, paint }) =>
      paintTent.execute({ tentId: id, playerId: player, tick, paint }),
    onHit: ({ id, player, tick }) =>
      takeDown.execute({ tentId: id, playerId: player, tick }),
    defer: true,
  });
}
