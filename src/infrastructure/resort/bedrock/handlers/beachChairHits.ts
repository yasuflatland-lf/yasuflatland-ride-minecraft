import type { TakeBackBeachChair } from "../../../../application/resort/takeBackBeachChair";
import { asBeachChairId } from "../../../../domain/resort/ids";
import { subscribeGearHits } from "../../../shared/gearHits";
import { BEACH_CHAIR } from "../../identifiers";

export function registerBeachChairHits(takeBack: TakeBackBeachChair): void {
  subscribeGearHits({
    idOf: (entity) =>
      entity.typeId === BEACH_CHAIR ? asBeachChairId(entity.id) : undefined,
    onHit: (cmd) => takeBack.execute(cmd),
    defer: true,
  });
}
