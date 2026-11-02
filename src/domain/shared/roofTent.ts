import type { Vec2 } from "./vec";

export type RoofTentMount = Readonly<{
  /** Blocks from the vehicle origin to the roof surface. */
  roofHeight: number;
  /** Tent center on the roof, vehicle-local (x = left, z = forward). */
  anchor: Vec2;
  /** True for the SUV, false for the camper, which already has a ladder. */
  ladder: boolean;
  /** Vehicle-local foot point of the entrance. */
  entrance: Vec2;
}>;
