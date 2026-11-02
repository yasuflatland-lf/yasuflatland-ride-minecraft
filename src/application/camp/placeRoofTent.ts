import { hostVerdict } from "../../domain/camp/roofTent/hostRule";
import {
  planRoofTent,
  type RoofTentTarget,
} from "../../domain/camp/roofTent/placement";
import { ROOF_TENT_SPEC } from "../../domain/camp/spec";
import type { DimensionId, PlayerId } from "../../domain/shared/ids";
import type { RoofTentMount } from "../../domain/shared/roofTent";
import { forward, localOffset, type Vec3 } from "../../domain/shared/vec";
import type { VehicleHostLookup } from "../shared/ports/vehicleHost";
import type { RoofTentWorld } from "./ports/roofTent";

interface PlaceRoofTentCommand {
  playerId?: PlayerId;
  dimensionId: DimensionId;
  target: { entityId: string } | { clicked: Vec3 };
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

  execute(cmd: PlaceRoofTentCommand): boolean {
    let target: RoofTentTarget;
    let at: { dimensionId: DimensionId; location: Vec3; yaw: number };
    if ("entityId" in cmd.target) {
      const id = cmd.target.entityId;
      const host = this.vehicleHost(id);
      if (host.status !== "present") return false;
      target = {
        type: "vehicle",
        id,
        mount: host.mount,
        hostInUse: hostVerdict({ ...host, presence: host.status }) === "remove",
        roofTaken: this.world.loaded().some((tentId) => {
          const other = this.world.hostOf(tentId);
          return other.kind === "vehicle" && other.id === id;
        }),
      };
      at = {
        dimensionId: host.dimensionId,
        location: host.mount
          ? roofLocation(host.location, host.yaw, host.mount)
          : host.location,
        yaw: host.yaw,
      };
    } else {
      const { clicked } = cmd.target;
      target = {
        type: "ground",
        clear: this.world.groundFree(cmd.dimensionId, clicked),
      };
      at = {
        dimensionId: cmd.dimensionId,
        location: { x: clicked.x + 0.5, y: clicked.y + 1, z: clicked.z + 0.5 },
        yaw: cmd.yaw,
      };
    }
    const plan = planRoofTent({ target, yaw: at.yaw });
    if (typeof plan === "string") {
      if (cmd.playerId !== undefined)
        this.world.showMessage(cmd.playerId, plan);
      return false;
    }
    if (target.type === "ground") at.yaw = plan.facing;
    let taken = false;
    if (cmd.playerId !== undefined && !this.world.isCreative(cmd.playerId)) {
      if (!this.world.consumeItem(cmd.playerId, cmd.slot)) return false;
      taken = true;
    }
    if (
      this.world.spawn(plan, at, cmd.playerId, ROOF_TENT_SPEC.defaultPaint) !==
      undefined
    )
      return true;
    if (taken && cmd.playerId !== undefined) this.world.giveItem(cmd.playerId);
    return false;
  }
}
