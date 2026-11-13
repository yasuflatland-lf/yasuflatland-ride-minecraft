import {
  type Entity,
  EntityInitializationCause,
  world,
} from "@minecraft/server";
import type { NormalizePaint } from "../../../../../application/vehicle/normalizePaint";
import { asVehicleId } from "../../../../../domain/shared/ids";
import { ENTITY_TYPE } from "../../../bedrock/identifiers";

export function registerNormalizePaint(normalize: NormalizePaint): void {
  const loaded = (entity: Entity): void => {
    if (!entity.isValid || entity.typeId !== ENTITY_TYPE.camper) return;
    normalize.normalizeFixedPaint(asVehicleId(entity.id));
  };
  world.afterEvents.entityLoad.subscribe((ev) => loaded(ev.entity));
  world.afterEvents.entitySpawn.subscribe((ev) => {
    if (ev.cause === EntityInitializationCause.Loaded) loaded(ev.entity);
  });
}
