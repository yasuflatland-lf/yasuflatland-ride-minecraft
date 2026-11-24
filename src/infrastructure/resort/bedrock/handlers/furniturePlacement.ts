import type { PlaceFurniture } from "../../../../application/resort/placeFurniture";
import { subscribeItemOnBlock } from "../../../shared/placeable";
import { furnitureKindOf } from "../../identifiers";

export function registerFurniturePlacement(place: PlaceFurniture): void {
  subscribeItemOnBlock({
    kindOf: (itemId) => furnitureKindOf(itemId, "item"),
    place: (cmd) => place.execute(cmd),
  });
}
