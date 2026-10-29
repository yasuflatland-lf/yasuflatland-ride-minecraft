import { TABLE_SPOTS } from "./spec";
import type { LocalPoint } from "./tabletop";

export type Host =
  | { readonly kind: "ground" }
  | { readonly kind: "fire_pit"; readonly id: string; readonly spot: number }
  | {
      readonly kind: "camp_table";
      readonly id: string;
      readonly at: LocalPoint;
    };

// The `s` flag lets `.+` cross newlines, so an id may hold any character and
// the last colon always separates it from the position.
const TABLE_POINT_MARKER =
  /^camp_table:(.+):@(-?[0-9]+(?:\.[0-9]+)?),(-?[0-9]+(?:\.[0-9]+)?)$/s;
const SPOT_MARKER = /^(fire_pit|camp_table):(.+):(0|[1-9][0-9]*)$/s;

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
    case "fire_pit":
      return `fire_pit:${host.id}:${host.spot}`;
    case "camp_table":
      return `camp_table:${host.id}:@${encodeCoordinate(host.at.x)},${encodeCoordinate(host.at.z)}`;
  }
}

export function decodeHost(text: string): Host {
  const point = TABLE_POINT_MARKER.exec(text);
  if (point) {
    const [, id, rawX, rawZ] = point;
    const x = Number(rawX);
    const z = Number(rawZ);
    if (!id || !Number.isFinite(x) || !Number.isFinite(z))
      return { kind: "ground" };
    return {
      kind: "camp_table",
      id,
      at: { x: withoutNegativeZero(x), z: withoutNegativeZero(z) },
    };
  }

  const marker = SPOT_MARKER.exec(text);
  if (!marker) return { kind: "ground" };
  const [, kind, id, rawSpot] = marker;
  const spot = Number(rawSpot);
  if (!id || !Number.isSafeInteger(spot)) return { kind: "ground" };
  if (kind === "fire_pit") return { kind, id, spot };
  // A legacy table marker stores an index into TABLE_SPOTS instead of a point.
  const at = TABLE_SPOTS[spot];
  return at ? { kind: "camp_table", id, at: { ...at } } : { kind: "ground" };
}
