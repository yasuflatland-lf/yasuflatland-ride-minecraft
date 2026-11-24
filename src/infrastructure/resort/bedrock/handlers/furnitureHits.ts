import type { FurnitureTopBlocksWorld } from "../../../../application/resort/ports/furnitureTopBlocks";
import type { TakeBackFurniture } from "../../../../application/resort/takeBackFurniture";
import { asFurnitureId } from "../../../../domain/resort/ids";
import { subscribeGearHits } from "../../../shared/gearHits";
import { DINING_TABLE_TOP, furnitureKindOf } from "../../identifiers";

export function registerFurnitureHits(
  takeBack: TakeBackFurniture,
  tops: Pick<FurnitureTopBlocksWorld, "ownerAt">,
): void {
  subscribeGearHits({
    idOf: (entity) =>
      furnitureKindOf(entity.typeId, "entity") === undefined
        ? undefined
        : asFurnitureId(entity.id),
    ownerOfBlock: (dimension, cell, typeId) =>
      typeId === DINING_TABLE_TOP ? tops.ownerAt(dimension, cell) : undefined,
    onHit: ({ id, player, tick }) => takeBack.hit({ id, player, now: tick }),
    defer: true,
  });
}
