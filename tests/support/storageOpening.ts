import type { StorageOpening } from "../../src/domain/vehicle/kinds/camper/dooredStorage";

export function hingedOpening(door: { readonly opening: StorageOpening }) {
  if (door.opening.kind !== "hinged")
    throw new Error("Expected a hinged storage fixture");
  return door.opening;
}
