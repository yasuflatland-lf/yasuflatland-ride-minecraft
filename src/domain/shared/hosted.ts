import { asVehicleId, type VehicleId } from "./ids";
import type { LocalPoint } from "./tableTop";

export type Host =
  | { readonly kind: "ground" }
  | { readonly kind: "vehicle"; readonly id: VehicleId }
  | {
      readonly kind: "spot";
      readonly hostType: "fire_pit";
      readonly id: string;
      readonly spot: number;
    }
  | {
      readonly kind: "top";
      readonly hostType: string;
      readonly id: string;
      readonly at: LocalPoint;
    };

// The `s` flag lets `.+` cross newlines, so an id may hold any character and
// the last colon always separates it from the position.
const TOP_POINT_MARKER =
  /^([a-z_]+):(.+):@(-?[0-9]+(?:\.[0-9]+)?),(-?[0-9]+(?:\.[0-9]+)?)$/s;
const SPOT_MARKER = /^([a-z_]+):(.+):(0|[1-9][0-9]*)$/s;

// Number#toString switches to exponent notation from 1e21, which the decoder
// does not accept, so the exponent is expanded back into plain digits.
function encodeCoordinate(value: number): string {
  const rounded = Number(value.toFixed(2)).toString();
  const [coefficient, exponent] = rounded.split("e+");
  if (coefficient === undefined || exponent === undefined) return rounded;
  const [whole, fraction = ""] = coefficient.split(".");
  return `${whole}${fraction}${"0".repeat(Number(exponent) - fraction.length)}`;
}

function withoutNegativeZero(value: number): number {
  return value === 0 ? 0 : value;
}

export function encodeHost(host: Host): string {
  switch (host.kind) {
    case "ground":
      return "";
    case "vehicle":
      return `vehicle:${host.id}`;
    case "spot":
      return `fire_pit:${host.id}:${host.spot}`;
    case "top":
      return `${host.hostType}:${host.id}:@${encodeCoordinate(host.at.x)},${encodeCoordinate(host.at.z)}`;
  }
}

export function decodeHost(
  text: string,
  legacySpot?: (hostType: string, spot: number) => LocalPoint | undefined,
): Host {
  if (text.startsWith("vehicle:") && text.length > "vehicle:".length)
    return { kind: "vehicle", id: asVehicleId(text.slice("vehicle:".length)) };

  const point = TOP_POINT_MARKER.exec(text);
  if (point) {
    const [, hostType, id, rawX, rawZ] = point;
    const x = Number(rawX);
    const z = Number(rawZ);
    if (
      !hostType ||
      hostType === "vehicle" ||
      hostType === "fire_pit" ||
      !id ||
      !Number.isFinite(x) ||
      !Number.isFinite(z)
    )
      return { kind: "ground" };
    return {
      kind: "top",
      hostType,
      id,
      at: { x: withoutNegativeZero(x), z: withoutNegativeZero(z) },
    };
  }

  const marker = SPOT_MARKER.exec(text);
  if (!marker) return { kind: "ground" };
  const [, kind, id, rawSpot] = marker;
  const spot = Number(rawSpot);
  if (!kind || !id || !Number.isSafeInteger(spot)) return { kind: "ground" };
  if (kind === "fire_pit") return { kind: "spot", hostType: kind, id, spot };
  const at = legacySpot?.(kind, spot);
  return at
    ? { kind: "top", hostType: kind, id, at: { ...at } }
    : { kind: "ground" };
}
