import type { Vec2 } from "./vec";

export type RoofTentShell = "raised" | "flat";

export type RoofTentMount = Readonly<{
  /** Blocks from the vehicle origin to the roof surface. */
  roofHeight: number;
  /** Tent center on the roof, vehicle-local (x = left, z = forward). */
  anchor: Vec2;
  shell: RoofTentShell;
  /** Whether the tent supplies its own entrance ladder. */
  ladder: boolean;
  /** Vehicle-local foot point of the entrance. */
  entrance: Vec2;
}>;
