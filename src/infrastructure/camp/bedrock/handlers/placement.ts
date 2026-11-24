import type { PlaceChair } from "../../../../application/camp/placeChair";
import { subscribeItemOnBlock } from "../../../shared/placeable";
import { CHAIR_KIND_BY_ITEM } from "../../identifiers";

export function registerChairPlacement(placeChair: PlaceChair): void {
  subscribeItemOnBlock({
    kindOf: (itemId) => CHAIR_KIND_BY_ITEM.get(itemId),
    accept: (dimension, block, face) =>
      placeChair.cellFor(dimension, block, face) !== undefined,
    place: ({ player, dimension, block, yaw, slot, kind }) =>
      placeChair.execute({
        kind,
        playerId: player,
        dimensionId: dimension,
        blockLocation: block,
        yaw,
        slot,
      }),
  });
}
