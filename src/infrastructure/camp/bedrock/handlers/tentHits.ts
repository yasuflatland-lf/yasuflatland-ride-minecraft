import type { TakeDownTent } from "../../../../application/camp/takeDownTent";
import type { Repaint } from "../../../../application/shared/repaint";
import { asTentId, type TentId } from "../../../../domain/camp/tent";
import type { Cell } from "../../../../domain/shared/cells";
import type { DimensionId } from "../../../../domain/shared/ids";
import { subscribeGearHits } from "../../../shared/gearHits";
import { TENT_TYPE } from "../../identifiers";

export function registerTentHits(
  takeDown: TakeDownTent,
  repaint: Repaint<TentId>,
  owner: (
    dimensionId: DimensionId,
    cell: Cell,
    typeId: string,
  ) => TentId | undefined,
): void {
  subscribeGearHits({
    idOf: (entity) =>
      entity.typeId === TENT_TYPE ? asTentId(entity.id) : undefined,
    ownerOfBlock: owner,
    onDye: ({ id, player, tick, paint }) =>
      repaint.execute({ entityId: id, playerId: player, tick, paint }),
    onHit: ({ id, player, tick }) =>
      takeDown.execute({ tentId: id, playerId: player, tick }),
    defer: true,
  });
}
