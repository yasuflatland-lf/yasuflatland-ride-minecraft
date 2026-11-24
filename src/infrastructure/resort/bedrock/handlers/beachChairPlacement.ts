import type { PlaceBeachChair } from "../../../../application/resort/placeBeachChair";
import { subscribeItemOnBlock } from "../../../shared/placeable";
import { BEACH_CHAIR_ITEM } from "../../identifiers";

export function registerBeachChairPlacement(place: PlaceBeachChair): void {
  subscribeItemOnBlock({
    kindOf: (itemId) => (itemId === BEACH_CHAIR_ITEM ? itemId : undefined),
    place: ({ kind: _kind, ...cmd }) => place.execute(cmd),
  });
}
