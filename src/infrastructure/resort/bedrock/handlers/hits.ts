import type { TakeBackParasol } from "../../../../application/resort/takeBackParasol";
import type { Repaint } from "../../../../application/shared/repaint";
import { asParasolId, type ParasolId } from "../../../../domain/resort/ids";
import { subscribeGearHits } from "../../../shared/gearHits";
import { BEACH_PARASOL } from "../../identifiers";

export function registerParasolHits(
  takeBack: TakeBackParasol,
  repaint: Repaint<ParasolId>,
): void {
  subscribeGearHits({
    idOf: (entity) =>
      entity.typeId === BEACH_PARASOL ? asParasolId(entity.id) : undefined,
    onDye: ({ id, player, tick, paint }) =>
      repaint.execute({ entityId: id, playerId: player, tick, paint }),
    onHit: (cmd) => takeBack.execute(cmd),
    defer: true,
  });
}
