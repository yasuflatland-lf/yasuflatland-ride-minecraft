import { hostVerdict } from "../../domain/camp/roofTent/hostRule";
import {
  groundRoofTentCells,
  planRoofTent,
  type RoofTentRefusal,
  type RoofTentTarget,
  supportsGroundRoofTent,
} from "../../domain/camp/roofTent/placement";
import { ROOF_TENT_SPEC } from "../../domain/camp/spec";
import { cellCenter } from "../../domain/shared/cells";
import type { DimensionId, PlayerId, VehicleId } from "../../domain/shared/ids";
import type { RoofTentMount } from "../../domain/shared/roofTent";
import { forward, localOffset, type Vec3 } from "../../domain/shared/vec";
import { placePaid } from "../shared/paidPlacement";
import type { VehicleHostLookup } from "../shared/ports/vehicleHost";
import type { RoofTentWorld } from "./ports/roofTent";

interface PlaceRoofTentCommand {
  playerId?: PlayerId;
  dimensionId: DimensionId;
  target: { entityId: VehicleId } | { clicked: Vec3 };
  yaw: number;
  slot: number;
}

function roofLocation(location: Vec3, yaw: number, mount: RoofTentMount): Vec3 {
  const offset = localOffset(forward(yaw), mount.anchor.z, -mount.anchor.x);
  return {
    x: location.x + offset.x,
    y: location.y + mount.roofHeight,
    z: location.z + offset.z,
  };
}

export class PlaceRoofTent {
  constructor(
    private readonly world: RoofTentWorld,
    private readonly vehicleHost: VehicleHostLookup,
  ) {}

  refusalFor(entityId: VehicleId): RoofTentRefusal | undefined {
    const vehicle = this.vehicleTarget(entityId);
    if (!vehicle) return undefined;
    const plan = planRoofTent({
      target: vehicle.target,
      yaw: vehicle.host.yaw,
    });
    return typeof plan === "string" ? plan : undefined;
  }

  private vehicleTarget(id: VehicleId) {
    const host = this.vehicleHost(id);
    if (host.status !== "present") return undefined;
    const target: RoofTentTarget = {
      type: "vehicle",
      id,
      mount: host.mount,
      hostInUse: hostVerdict({ ...host, presence: host.status }) === "remove",
      roofTaken: this.world.loaded().some((tentId) => {
        const other = this.world.hostOf(tentId);
        return other.kind === "vehicle" && other.id === id;
      }),
    };
    return { host, target };
  }

  private groundFree(
    dimension: DimensionId,
    clicked: Vec3,
    origin: Vec3,
  ): boolean {
    const { support, clear } = groundRoofTentCells(clicked);
    try {
      return (
        support.every((cell) =>
          supportsGroundRoofTent(this.world.blockAt(dimension, cell)),
        ) &&
        clear.every(
          (cell) =>
            this.world.blockAt(dimension, cell)?.isAir === true &&
            !this.world.isVehicleSpace(dimension, cell) &&
            !this.world.isCampSpace(dimension, cell),
        ) &&
        !this.world.hasRoofTentNear(dimension, origin)
      );
    } catch {
      // A chunk can unload during a block or space check.
      return false;
    }
  }

  execute(cmd: PlaceRoofTentCommand): boolean {
    let target: RoofTentTarget;
    let at: { dimensionId: DimensionId; location: Vec3; yaw: number };
    if ("entityId" in cmd.target) {
      const vehicle = this.vehicleTarget(cmd.target.entityId);
      if (!vehicle) return false;
      const { host } = vehicle;
      target = vehicle.target;
      at = {
        dimensionId: host.dimensionId,
        location: host.mount
          ? roofLocation(host.location, host.yaw, host.mount)
          : host.location,
        yaw: host.yaw,
      };
    } else {
      const { clicked } = cmd.target;
      const origin = cellCenter(clicked, 1);
      target = {
        type: "ground",
        clear: this.groundFree(cmd.dimensionId, clicked, origin),
      };
      at = {
        dimensionId: cmd.dimensionId,
        location: origin,
        yaw: cmd.yaw,
      };
    }
    const plan = planRoofTent({ target, yaw: at.yaw });
    if (typeof plan === "string") {
      if (cmd.playerId !== undefined)
        this.world.showRefusal(cmd.playerId, plan);
      return false;
    }
    if (target.type === "ground") at.yaw = plan.facing;
    const result = placePaid(
      this.world,
      { player: cmd.playerId, slot: cmd.slot },
      () =>
        this.world.spawn(plan, at, cmd.playerId, ROOF_TENT_SPEC.defaultPaint),
    );
    return result.placed;
  }
}
