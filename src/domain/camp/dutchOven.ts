export type DutchOvenId = string & { readonly __brand: "DutchOvenId" };

export function asDutchOvenId(value: string): DutchOvenId {
  return value as DutchOvenId;
}

export type OvenHost =
  | { kind: "ground" }
  | { kind: "fire_pit"; id: string; spot: number }
  | { kind: "camp_table"; id: string; spot: number };

/** Simmering depends on the host, even when the fire is unlit (ADR 0168). */
export function isSimmering(host: OvenHost): boolean {
  return host.kind === "fire_pit";
}

export function encodeHost(host: OvenHost): string {
  return host.kind === "ground" ? "" : `${host.kind}:${host.id}:${host.spot}`;
}

export function decodeHost(text: string): OvenHost {
  const match = /^(fire_pit|camp_table):(.+):(0|[1-9][0-9]*)$/s.exec(text);
  if (!match) return { kind: "ground" };
  const [, kind, id, rawSpot] = match;
  const spot = Number(rawSpot);
  if (
    (kind !== "fire_pit" && kind !== "camp_table") ||
    !id ||
    !Number.isSafeInteger(spot)
  )
    return { kind: "ground" };
  return { kind, id, spot };
}
