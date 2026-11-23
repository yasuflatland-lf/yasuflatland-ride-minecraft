import type { PitchTent } from "../../../../application/camp/pitchTent";
import { subscribeItemOnBlock } from "../../../shared/placeable";
import { TENT_ITEM } from "../../identifiers";

export function registerTentPlacement(pitchTent: PitchTent): void {
  subscribeItemOnBlock({
    kindOf: (itemId) => (itemId === TENT_ITEM ? itemId : undefined),
    accept: (dimension, block, face) =>
      face === "up" && pitchTent.accepts(dimension, block),
    place: ({ player, dimension, block, yaw, slot }) =>
      pitchTent.execute({
        playerId: player,
        dimensionId: dimension,
        clicked: block,
        yaw,
        slot,
      }),
  });
}
