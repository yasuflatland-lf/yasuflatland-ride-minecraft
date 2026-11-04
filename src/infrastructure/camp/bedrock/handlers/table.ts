import type { HitTable } from "../../../../application/camp/hitTable";
import type { PlaceTable } from "../../../../application/camp/placeTable";
import { asTableId } from "../../../../domain/camp/table";
import {
  CAMP_TABLE_ITEM,
  CAMP_TABLE_TYPE,
  TEST_TABLE_HIT_EVENT,
} from "../../identifiers";
import {
  type HitContext,
  type PlaceContext,
  registerPlaceableEntity,
} from "./placeable";

export function registerTable(place: PlaceTable, hit: HitTable): void {
  registerPlaceableEntity({
    itemId: CAMP_TABLE_ITEM,
    entityTypeIds: new Set([CAMP_TABLE_TYPE]),
    canUseBlock: (dimension, block, face) =>
      place.canUseBlock(dimension, block, face),
    place: ({ player, dimension, block, yaw, slot }: PlaceContext) =>
      place.execute({
        playerId: player,
        dimensionId: dimension,
        blockLocation: block,
        yaw,
        slot,
      }),
    hit: ({ entity, player, tick }: HitContext) =>
      hit.execute({ tableId: asTableId(entity.id), playerId: player, tick }),
    testHitEvent: TEST_TABLE_HIT_EVENT,
  });
}
