import { type Cell, cellOf } from "../../shared/cells";
import { CLEARABLE_DECORATIONS } from "../../shared/decorations";
import { type Facing4, snapYaw4 } from "../../shared/facing";
import type { Host } from "../../shared/hosted";
import type { VehicleId } from "../../shared/ids";
import type { RoofTentMount, RoofTentShell } from "../../shared/roofTent";

export interface RoofTentBlock {
  readonly typeId: string;
  readonly isAir: boolean;
  readonly isLiquid: boolean;
}

export function supportsGroundRoofTent(
  block: RoofTentBlock | undefined,
): boolean {
  return (
    block !== undefined &&
    !block.isAir &&
    !block.isLiquid &&
    !CLEARABLE_DECORATIONS.has(block.typeId)
  );
}

export function groundRoofTentCells(clicked: Cell) {
  const clear: Cell[] = [];
  for (const dx of [-1, 0, 1])
    for (const dz of [-1, 0, 1])
      for (const dy of [1, 2])
        clear.push(
          cellOf({ x: clicked.x + dx, y: clicked.y + dy, z: clicked.z + dz }),
        );
  return { support: [clicked], clear };
}

export type RoofTentRefusal =
  | "unsupported_vehicle"
  | "roof_taken"
  | "host_in_use"
  | "blocked";

export type RoofTentPlan = {
  readonly host: Host;
  readonly facing: Facing4;
  readonly shell: RoofTentShell;
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
      ? { host: { kind: "ground" }, facing, shell: "flat", ladder: false }
      : "blocked";
  }
  if (!target.mount) return "unsupported_vehicle";
  if (target.hostInUse) return "host_in_use";
  if (target.roofTaken) return "roof_taken";
  return {
    host: { kind: "vehicle", id: target.id },
    facing,
    shell: target.mount.shell,
    ladder: target.mount.ladder,
  };
}
