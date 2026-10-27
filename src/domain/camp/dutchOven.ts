export type DutchOvenId = string & { readonly __brand: "DutchOvenId" };

export function asDutchOvenId(value: string): DutchOvenId {
  return value as DutchOvenId;
}
