import type { VehicleKind } from "../kind";

// What every player gets, once per kind, on their first join (ADR 0023).
// The SUV drives on land, where every new player starts.
export const STARTER_KINDS = ["suv"] as const satisfies readonly VehicleKind[];
export type StarterKind = (typeof STARTER_KINDS)[number];
