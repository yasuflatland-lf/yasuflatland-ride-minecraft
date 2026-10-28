export type GasLanternId = string & { readonly __brand: "GasLanternId" };

export function asGasLanternId(value: string): GasLanternId {
  return value as GasLanternId;
}
