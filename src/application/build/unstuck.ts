import { type CellBox, contains } from "../../domain/build/box";
import { freeCellAbove } from "../../domain/build/freeCell";
import { cellOf } from "../../domain/shared/cells";
import type { DimensionId, PlayerId } from "../../domain/shared/ids";
import { isOpenBlock } from "../../domain/shared/keptBlocks";
import type { BuildBlockWorld } from "./ports/blocks";
import type { BuildPlayers } from "./ports/players";

export function unstuck(
  world: BuildBlockWorld,
  players: BuildPlayers,
  playerId: PlayerId,
  dimensionId: DimensionId,
  box?: CellBox,
): void {
  const occupant = players.occupantOf(playerId);
  if (!occupant || occupant.dimensionId !== dimensionId) return;
  const { feet } = occupant;
  const head = cellOf({ ...feet, y: feet.y + 1 });
  const buried = [feet, head].some((cell) => {
    const state = world.stateAt(dimensionId, cell);
    return (
      (!box || contains(box, cell)) &&
      state !== undefined &&
      !isOpenBlock(state.typeId)
    );
  });
  if (!buried) return;
  const destination = freeCellAbove(
    feet,
    (cell) => world.stateAt(dimensionId, cell)?.typeId === "minecraft:air",
    world.heightRange(dimensionId).maxY,
  );
  if (destination) players.moveTo(playerId, destination);
}
