// Ports for switching a vehicle's headlights; implemented in the infrastructure layer (ADR 0012).

export interface HeadlightWorld {
  /** undefined when the vehicle no longer exists. */
  headlightsOn(vehicleId: string): boolean | undefined;
  setHeadlights(vehicleId: string, on: boolean): void;
}
