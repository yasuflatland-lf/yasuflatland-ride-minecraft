// Branded ids, so one kind of id cannot be passed where another kind of id is
// expected. The brand exists only at compile time.

/** The Entity.id of a vehicle entity. */
export type VehicleId = string & { readonly __brand: "VehicleId" };

/**
 * Brands an id that is known to belong to a vehicle entity. Called only where
 * the id comes from the engine or from stored data (the infrastructure layer),
 * and in tests. Returns its argument unchanged.
 */
export function asVehicleId(raw: string): VehicleId {
  return raw as VehicleId;
}

/** The Player.id of a player entity. */
export type PlayerId = string & { readonly __brand: "PlayerId" };

/** The Dimension.id of a dimension, such as "minecraft:overworld". */
export type DimensionId = string & { readonly __brand: "DimensionId" };

/**
 * Brands an id that is known to belong to a player. Called only in the
 * infrastructure layer and in tests. Returns its argument unchanged.
 */
export function asPlayerId(raw: string): PlayerId {
  return raw as PlayerId;
}

/**
 * Brands an id that is known to name a dimension. Called only in the
 * infrastructure layer and in tests. Returns its argument unchanged.
 */
export function asDimensionId(raw: string): DimensionId {
  return raw as DimensionId;
}
