import type { HitChair } from "../../../../application/camp/hitChair";
import { asChairId } from "../../../../domain/camp/chair";
import { subscribeGearHits } from "../../../shared/gearHits";
import { CHAIR_KIND_BY_TYPE } from "../../identifiers";

export function registerChairHits(hitChair: HitChair): void {
  subscribeGearHits({
    idOf: (entity) => {
      const kind = CHAIR_KIND_BY_TYPE.get(entity.typeId);
      return kind === undefined
        ? undefined
        : { kind, chairId: asChairId(entity.id) };
    },
    onHit: ({ id, player, tick }) =>
      hitChair.execute({ ...id, playerId: player, tick }),
    defer: true,
  });
}
