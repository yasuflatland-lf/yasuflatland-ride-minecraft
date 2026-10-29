import { TABLE_SPOTS } from "./spec";

export type Host =
  | { readonly kind: "ground" }
  | { readonly kind: "fire_pit"; readonly id: string; readonly spot: number }
  | {
      readonly kind: "camp_table";
      readonly id: string;
      readonly at: { readonly x: number; readonly z: number };
    };

function encodeCoordinate(value: number): string {
  const rounded = Number(value.toFixed(2)).toString();
  const [coefficient, exponent] = rounded.split("e+");
  if (coefficient === undefined || exponent === undefined) return rounded;
  const [whole, fraction = ""] = coefficient.split(".");
  return `${whole}${fraction}${"0".repeat(Number(exponent) - fraction.length)}`;
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
  const point =
    /^camp_table:(.+):@(-?[0-9]+(?:\.[0-9]+)?),(-?[0-9]+(?:\.[0-9]+)?)$/s.exec(
      text,
    );
  if (point) {
    const [, id, rawX, rawZ] = point;
    const x = Number(rawX);
    const z = Number(rawZ);
    if (id && Number.isFinite(x) && Number.isFinite(z))
      return {
        kind: "camp_table",
        id,
        at: { x: x === 0 ? 0 : x, z: z === 0 ? 0 : z },
      };
    return { kind: "ground" };
  }
  const match = /^(fire_pit|camp_table):(.+):(0|[1-9][0-9]*)$/s.exec(text);
  if (!match) return { kind: "ground" };
  const [, kind, id, rawSpot] = match;
  const spot = Number(rawSpot);
  if (!id || !Number.isSafeInteger(spot)) return { kind: "ground" };
  if (kind === "fire_pit") return { kind, id, spot };
  const at = TABLE_SPOTS[spot];
  return at ? { kind: "camp_table", id, at: { ...at } } : { kind: "ground" };
}
