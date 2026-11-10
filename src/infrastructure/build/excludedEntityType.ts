import { NAMESPACE } from "../shared/identifiers";
import { BUILD_NAMESPACE } from "./identifiers";

export function isAddonEntityType(typeId: string): boolean {
  return (
    typeId.startsWith(`${NAMESPACE}:`) ||
    typeId.startsWith(`${BUILD_NAMESPACE}:`)
  );
}

export function excludedEntityType(
  isFleetEntityType: (typeId: string) => boolean,
): (typeId: string) => boolean {
  return (typeId) => isAddonEntityType(typeId) || isFleetEntityType(typeId);
}
