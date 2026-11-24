// Kind-neutral hold pose and the cells a stopped vehicle lays (ADR 0063, 0068).
import type { LaidCell } from "../../shared/laidCells";

export interface HoldPose {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
}

export interface DockBlockBase {
  readonly type: string;
}

/** Collision height in pixels, 1..16 (yasu_ride:deck_floor). */
export interface DeckBlock {
  readonly type: "deck";
  readonly height: number;
}

/** An invisible light block without collision. */
export interface LightBlock {
  readonly type: "light";
}

export type DockCell<B extends DockBlockBase = DockBlockBase> = LaidCell<B>;

export function sameBlock<A extends DockBlockBase, B extends DockBlockBase>(
  a: A,
  b: B,
): boolean {
  const keys = Reflect.ownKeys(a);
  return (
    keys.length === Reflect.ownKeys(b).length &&
    keys.every(
      (key) =>
        Object.hasOwn(b, key) && Reflect.get(a, key) === Reflect.get(b, key),
    )
  );
}
