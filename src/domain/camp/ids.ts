export type RoofTentId = string & { readonly __brand: "RoofTentId" };

export function asRoofTentId(raw: string): RoofTentId {
  return raw as RoofTentId;
}
