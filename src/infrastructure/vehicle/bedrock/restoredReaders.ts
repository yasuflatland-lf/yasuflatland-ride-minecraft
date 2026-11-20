import type { Entity } from "@minecraft/server";
import type { VehicleKind } from "../../../domain/vehicle/kind";
import type { RestoredValues } from "../../../domain/vehicle/kinds/index";

/** Values a kind's infrastructure reads back from its entity beyond the contract's entity properties. */
export type RestoredReader = (vehicle: Entity) => RestoredValues;
export type RestoredReaders = Readonly<
  Partial<Record<VehicleKind, RestoredReader>>
>;
