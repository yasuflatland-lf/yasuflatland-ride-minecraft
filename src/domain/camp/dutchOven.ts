import type { Host } from "../shared/hosted";
import type { Brand } from "../shared/ids";

export type DutchOvenId = Brand<string, "DutchOvenId">;

export function asDutchOvenId(value: string): DutchOvenId {
  return value as DutchOvenId;
}

/** The host sets only the initial lid state; later presses toggle it (ADR 0191). */
export function initialSimmering(host: Host): boolean {
  return host.kind === "spot" && host.hostType === "fire_pit";
}
