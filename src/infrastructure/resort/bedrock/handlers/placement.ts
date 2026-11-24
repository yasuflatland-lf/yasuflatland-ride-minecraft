import type { PlaceParasol } from "../../../../application/resort/placeParasol";
import { subscribeItemOnBlock } from "../../../shared/placeable";
import { BEACH_PARASOL_ITEM } from "../../identifiers";

export function registerParasolPlacement(place: PlaceParasol): void {
  subscribeItemOnBlock({
    kindOf: (itemId) => (itemId === BEACH_PARASOL_ITEM ? itemId : undefined),
    place: ({ kind: _kind, ...cmd }) => place.execute(cmd),
  });
}
