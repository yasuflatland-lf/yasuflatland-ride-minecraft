import type { PaintParasol } from "../../../../application/resort/paintParasol";
import type { TakeBackParasol } from "../../../../application/resort/takeBackParasol";
import { asParasolId } from "../../../../domain/resort/ids";
import { subscribeGearHits } from "../../../shared/gearHits";
import { BEACH_PARASOL } from "../../identifiers";

export function registerParasolHits(
  takeBack: TakeBackParasol,
  paintParasol: PaintParasol,
): void {
  subscribeGearHits({
    idOf: (entity) =>
      entity.typeId === BEACH_PARASOL ? asParasolId(entity.id) : undefined,
    onDye: ({ id, player, tick, paint }) =>
      paintParasol.execute({ parasolId: id, playerId: player, tick, paint }),
    onHit: (cmd) => takeBack.execute(cmd),
    defer: true,
  });
}
