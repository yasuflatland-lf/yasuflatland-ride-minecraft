// Branded ids, so a vehicle id cannot be passed where another kind of id is
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
