import { type Facing4, snapYaw4 } from "../../shared/facing";
import type { Host } from "../../shared/hosted";
import type { VehicleId } from "../../shared/ids";
import type { RoofTentMount } from "../../shared/roofTent";

export type RoofTentRefusal =
  | "unsupported_vehicle"
  | "roof_taken"
  | "host_in_use"
  | "blocked";

export type RoofTentPlan = {
  readonly host: Host;
  readonly facing: Facing4;
  readonly ladder: boolean;
};

export type RoofTentTarget =
  | {
      readonly type: "vehicle";
      readonly id: VehicleId;
      readonly mount: RoofTentMount | undefined;
      readonly roofTaken: boolean;
      readonly hostInUse?: boolean;
    }
  | { readonly type: "ground"; readonly clear: boolean };

export function planRoofTent(input: {
  target: RoofTentTarget;
  yaw: number;
}): RoofTentPlan | RoofTentRefusal {
  const { target } = input;
  const facing = snapYaw4(input.yaw);
  if (target.type === "ground") {
    return target.clear
      ? { host: { kind: "ground" }, facing, ladder: false }
      : "blocked";
  }
  if (!target.mount) return "unsupported_vehicle";
  if (target.hostInUse) return "host_in_use";
  if (target.roofTaken) return "roof_taken";
  return {
    host: { kind: "vehicle", id: target.id },
    facing,
    ladder: target.mount.ladder,
  };
}
