import { dot, forward, leftOf, type Vec2, type Vec3 } from "./vec";

interface LocalOffset {
  readonly ahead: number;
  readonly left: number;
  readonly up: number;
}

export class LocalFrame {
  readonly aheadAxis: Vec2;
  readonly leftAxis: Vec2;

  /** A caller that already has a unit forward vector can supply it directly. */
  constructor(
    private readonly origin: Vec3,
    yaw: number | Vec2,
  ) {
    this.aheadAxis = typeof yaw === "number" ? forward(yaw) : yaw;
    this.leftAxis = leftOf(this.aheadAxis);
  }

  /** Cardinal yaw needs exact grid axes before transforming block cells. */
  static grid(origin: Vec3, yaw: number): LocalFrame {
    const f = forward(yaw);
    return new LocalFrame(origin, { x: Math.round(f.x), z: Math.round(f.z) });
  }

  /** Keep translation order explicit for callers that floor the resulting point. */
  toWorld(
    { ahead, left, up }: LocalOffset,
    order: "ahead-first" | "left-first" = "ahead-first",
  ): Vec3 {
    const f = this.aheadAxis;
    const l = this.leftAxis;
    const { x, y, z } = this.origin;
    if (order === "left-first") {
      return {
        x: x + l.x * left + f.x * ahead,
        y: y + up,
        z: z + l.z * left + f.z * ahead,
      };
    }
    return {
      x: x + f.x * ahead + l.x * left,
      y: y + up,
      z: z + f.z * ahead + l.z * left,
    };
  }

  /** Rotate a displacement before the caller applies scaling or translation. */
  toWorldOffset({ ahead, left, up }: LocalOffset): Vec3 {
    const f = this.aheadAxis;
    const l = this.leftAxis;
    return { x: f.x * ahead + l.x * left, y: up, z: f.z * ahead + l.z * left };
  }

  toLocal(point: Vec3): LocalOffset {
    const offset = { x: point.x - this.origin.x, z: point.z - this.origin.z };
    return {
      ahead: dot(offset, this.aheadAxis),
      left: dot(offset, this.leftAxis),
      up: point.y - this.origin.y,
    };
  }
}

/** Seat model offsets use +x to the right and -z toward the front. */
export function modelToLocal({ x, y, z }: Vec3): LocalOffset {
  return { ahead: -z, left: -x, up: y };
}

export function seatWorldPoint(origin: Vec3, yaw: number, seat: Vec3): Vec3 {
  return new LocalFrame(origin, yaw).toWorld(modelToLocal(seat), "left-first");
}
