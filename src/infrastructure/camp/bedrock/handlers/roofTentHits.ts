import type { FoldRoofTent } from "../../../../application/camp/foldRoofTent";
import type { PaintRoofTent } from "../../../../application/camp/paintRoofTent";
import { asRoofTentId } from "../../../../domain/camp/ids";
import { subscribeGearHits } from "../../../shared/gearHits";
import { ROOF_TENT_TYPE } from "../../identifiers";

export function registerRoofTentHits(
  fold: FoldRoofTent,
  paint: PaintRoofTent,
): void {
  subscribeGearHits({
    idOf: (entity) =>
      entity.typeId === ROOF_TENT_TYPE ? asRoofTentId(entity.id) : undefined,
    onDye: ({ id, player, tick, paint: dye }) =>
      paint.execute({ tentId: id, playerId: player, tick, paint: dye }),
    onHit: ({ id, player, tick }) =>
      fold.execute({ tentId: id, playerId: player, tick }),
    defer: true,
  });
}
