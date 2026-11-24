import { type Cell, parseCell, sameCell } from "../../../shared/cells";
import { add3, distanceSq, sub3, type Vec3 } from "../../../shared/vec";
import type { DecorPlacement } from "../../dock/decor";
import type { HoldPose } from "../../dock/floor";
import {
  DRAWER_COMPARTMENT,
  KITCHEN_DRAWERS,
  type StorageDoorId,
} from "./furniture";
import { axes, localCellAt } from "./parkPose";
import { DRAWER_SLIDE_PX, DRAWER_HIT_PROFILE as HIT } from "./spec";

type Point = readonly [number, number, number];
interface Target {
  min: Point;
  max: Point;
  height: number;
  door?: StorageDoorId;
  takeContents: boolean;
}

function intersection(
  origin: Point,
  direction: Point,
  target: Target,
): number | undefined {
  let near = 0;
  let far = Infinity;
  for (const axis of [0, 1, 2] as const) {
    const step = direction[axis];
    if (step === 0) {
      if (origin[axis] < target.min[axis] || origin[axis] > target.max[axis])
        return undefined;
      continue;
    }
    const a = (target.min[axis] - origin[axis]) / step;
    const b = (target.max[axis] - origin[axis]) / step;
    near = Math.max(near, Math.min(a, b));
    far = Math.min(far, Math.max(a, b));
    if (near > far) return undefined;
  }
  return near;
}

/** Resolve the visible drawer/front/counter along a press ray in the combined block. */
export function drawerHit(
  pose: HoldPose,
  eye: Vec3,
  ray: Vec3,
  decor: readonly DecorPlacement[],
  open: ReadonlySet<StorageDoorId>,
  pressCell?: Vec3,
):
  | {
      door?: StorageDoorId;
      point?: Vec3;
      takeContents: boolean;
      floorFootprint?: boolean;
    }
  | undefined {
  if (
    ![
      pose.x,
      pose.y,
      pose.z,
      pose.yaw,
      eye.x,
      eye.y,
      eye.z,
      ray.x,
      ray.y,
      ray.z,
    ].every(Number.isFinite)
  )
    return undefined;
  const cell = localCellAt(pose, DRAWER_COMPARTMENT);
  const { f, l } = axes(pose.yaw);
  const local = (p: Vec3): Point => {
    const x = p.x - cell.x - 0.5;
    const z = p.z - cell.z - 0.5;
    return [
      (x * l.x + z * l.z) * HIT.pixelsPerBlock,
      (p.y - cell.y) * HIT.pixelsPerBlock,
      (x * f.x + z * f.z) * HIT.pixelsPerBlock,
    ];
  };
  const origin = local(eye);
  const end = local(add3(eye, ray));
  const direction: Point = [
    end[0] - origin[0],
    end[1] - origin[1],
    end[2] - origin[2],
  ];
  if (
    ![...origin, ...direction].every(Number.isFinite) ||
    direction.every((value) => value === 0)
  )
    return undefined;
  const half = HIT.counterHalfWidth;
  const targets: Target[] = [
    {
      min: [-half, HIT.counterHeight, -half],
      max: [half, HIT.counterHeight, half],
      height: HIT.counterHeight,
      takeContents: false,
    },
  ];
  for (const door of KITCHEN_DRAWERS.doors) {
    if (origin[0] < -half) continue;
    if (door.id !== "drawer_top" && door.id !== "drawer_bottom") continue;
    const slot = door.slots[0];
    if (!slot) continue;
    const shift = open.has(door.id) ? DRAWER_SLIDE_PX : 0;
    const bottom = HIT.frontBottom[door.id];
    targets.push({
      // Only the lowest drawer reaches the floor; a taller box on the top drawer would occlude the bottom front.
      min: [
        HIT.frontLeftMin + shift,
        shift && door.id === "drawer_bottom" ? 0 : bottom,
        HIT.frontAheadMin,
      ],
      max: [
        HIT.frontLeftMax + shift,
        bottom + HIT.frontHeight,
        HIT.frontAheadMax,
      ],
      height: slot.height,
      door: door.id,
      takeContents: false,
    });
    if (!open.has(door.id)) continue;
    const item = decor.find((placement) => placement.slot === slot.id)?.item;
    targets.push({
      min: [half, bottom, HIT.frontAheadMin],
      max: [
        HIT.frontLeftMax + shift,
        bottom + HIT.frontHeight,
        HIT.frontAheadMax,
      ],
      height: slot.height,
      door: door.id,
      takeContents: item !== undefined,
    });
    const gear =
      item !== undefined && Object.hasOwn(HIT.gear, item)
        ? HIT.gear[item as keyof typeof HIT.gear]
        : undefined;
    if (!gear) continue;
    const width = gear.width / 2;
    targets.push({
      min: [HIT.contentLeft - width, slot.height, HIT.contentAhead - width],
      max: [
        HIT.contentLeft + width,
        slot.height + gear.height,
        HIT.contentAhead + width,
      ],
      height: slot.height,
      door: door.id,
      takeContents: true,
    });
  }
  let nearest: { target: Target; distance: number } | undefined;
  for (const target of targets) {
    const distance = intersection(origin, direction, target);
    if (
      distance !== undefined &&
      (nearest === undefined ||
        distance < nearest.distance ||
        (distance === nearest.distance &&
          target.door === "drawer_bottom" &&
          nearest.target.door === "drawer_top" &&
          origin[1] + direction[1] * distance < HIT.frontBottom.drawer_top))
    ) {
      nearest = { target, distance };
    }
  }
  if (!nearest) {
    const margin = HIT.floorFootprintMargin;
    if (
      !pressCell ||
      !drawerPressCell(pose, pressCell) ||
      distanceSq(pressCell, cell) === 0 ||
      end[0] < half - margin ||
      end[0] > HIT.frontLeftMax + DRAWER_SLIDE_PX + margin ||
      end[2] < HIT.frontAheadMin - margin ||
      end[2] > HIT.frontAheadMax + margin
    )
      return undefined;
    const door = (["drawer_bottom", "drawer_top"] as const).find((id) =>
      open.has(id),
    );
    return door
      ? { door, takeContents: false, floorFootprint: true }
      : undefined;
  }
  const left = origin[0] + direction[0] * nearest.distance;
  const ahead = origin[2] + direction[2] * nearest.distance;
  return {
    door: nearest.target.door,
    point: {
      x: cell.x + 0.5 + (left * l.x + ahead * f.x) / HIT.pixelsPerBlock,
      y: cell.y + nearest.target.height / HIT.pixelsPerBlock,
      z: cell.z + 0.5 + (left * l.z + ahead * f.z) / HIT.pixelsPerBlock,
    },
    takeContents: nearest.target.takeContents,
  };
}

/** Only the counter and its adjacent aisle cells may forward a block press. */
export function drawerPressCell(pose: HoldPose, at: Vec3): Cell | undefined {
  const cell = parseCell(at);
  if (!cell) return undefined;
  const counter = localCellAt(pose, DRAWER_COMPARTMENT);
  const cells = [
    counter,
    localCellAt(pose, { x: 0, z: DRAWER_COMPARTMENT.z, layer: 1 }),
    localCellAt(pose, { x: 0, z: DRAWER_COMPARTMENT.z, layer: 0 }),
  ];
  return cells.some((c) => sameCell(c, cell)) ? counter : undefined;
}

export function drawerBlockHit(
  pose: HoldPose,
  cell: Vec3,
  eye: Vec3,
  point: Vec3,
  decor: readonly DecorPlacement[],
  open: ReadonlySet<StorageDoorId>,
) {
  if (!drawerPressCell(pose, cell)) return undefined;
  const hit = drawerHit(pose, eye, sub3(point, eye), decor, open);
  return hit?.point ? { ...hit, point: hit.point } : undefined;
}
