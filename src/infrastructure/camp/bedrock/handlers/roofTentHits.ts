import type { FoldRoofTent } from "../../../../application/camp/foldRoofTent";
import type { Repaint } from "../../../../application/shared/repaint";
import { asRoofTentId, type RoofTentId } from "../../../../domain/camp/ids";
import { subscribeGearHits } from "../../../shared/gearHits";
import { ROOF_TENT_TYPE } from "../../identifiers";

export function registerRoofTentHits(
  fold: FoldRoofTent,
  repaint: Repaint<RoofTentId>,
): void {
  subscribeGearHits({
    idOf: (entity) =>
      entity.typeId === ROOF_TENT_TYPE ? asRoofTentId(entity.id) : undefined,
    onDye: ({ id, player, tick, paint: dye }) =>
      repaint.execute({ entityId: id, playerId: player, tick, paint: dye }),
    onHit: ({ id, player, tick }) =>
      fold.execute({ tentId: id, playerId: player, tick }),
    defer: true,
  });
}
