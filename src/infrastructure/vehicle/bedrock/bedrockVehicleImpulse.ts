// Applies vehicle motion, engine commands and ram damage (ADR 0012).
import { EntityDamageCause, world } from "@minecraft/server";
import type { ImpulseWorld } from "../../../application/vehicle/ports/drive";
import type { PlayerId, VehicleId } from "../../../domain/shared/ids";
import type { Vec3 } from "../../../domain/shared/vec";
import type { HoldPose } from "../../../domain/vehicle/dock/floor";
import type { EngineCommand } from "../../../domain/vehicle/drive";
import type { RamHit } from "../../../domain/vehicle/ram";
import type { EntityIndex } from "./entityIndex";
import {
  entityAnimationId,
  entityEventId,
  entityPropertyId,
} from "./identifiers";

export class BedrockVehicleImpulse implements ImpulseWorld {
  constructor(
    private readonly index: EntityIndex,
    private readonly holds: Map<VehicleId, HoldPose>,
  ) {}

  applyMotion(vehicleId: VehicleId, impulse: Vec3, yaw: number): void {
    if (this.holds.has(vehicleId)) return;
    const vehicle = this.index.entity(vehicleId);
    if (!vehicle) return;
    vehicle.applyImpulse(impulse);
    vehicle.setRotation({ x: 0, y: yaw });
  }

  holdAt(vehicleId: VehicleId, pose: HoldPose | undefined): void {
    if (!pose) {
      this.holds.delete(vehicleId);
      return;
    }
    this.holds.set(vehicleId, pose);
    const vehicle = this.index.entity(vehicleId);
    if (!vehicle) return;
    vehicle.teleport(
      { x: pose.x, y: pose.y, z: pose.z },
      { rotation: { x: 0, y: pose.yaw } },
    );
    vehicle.clearVelocity();
  }

  run(vehicleId: VehicleId, commands: readonly EngineCommand[]): void {
    const entity = this.index.entity(vehicleId);
    if (!entity) return;
    for (const command of commands) {
      switch (command.type) {
        case "setProperty":
          entity.setProperty(entityPropertyId(command.name), command.value);
          break;
        case "triggerEvent":
          entity.triggerEvent(entityEventId(command.name));
          break;
        case "playAnimation":
          entity.playAnimation(entityAnimationId(entity.typeId, command.name));
          break;
        case "playSound":
          entity.dimension.playSound(command.name, entity.location);
          break;
        default: {
          const unknown: never = command;
          throw new Error(`Unknown engine command: ${JSON.stringify(unknown)}`);
        }
      }
    }
  }

  damage(hit: RamHit, attackerId: PlayerId | undefined): void {
    const target = world.getEntity(hit.id);
    if (!target?.isValid) return;
    const attacker = attackerId ? world.getEntity(attackerId) : undefined;
    target.applyDamage(hit.damage, {
      cause: EntityDamageCause.entityAttack,
      damagingEntity: attacker,
    });
    target.applyKnockback({ x: hit.push.x, z: hit.push.z }, hit.pushUp);
  }
}
