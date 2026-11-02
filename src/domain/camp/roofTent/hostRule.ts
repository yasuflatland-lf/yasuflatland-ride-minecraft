import type { HostPresence } from "../../shared/hostPresence";

export function hostVerdict(host: {
  readonly presence: HostPresence;
  readonly driverPresent: boolean;
  readonly moving: boolean;
}): "keep" | "remove" {
  if (host.presence === "unknown") return "keep";
  return host.presence === "removed" || host.driverPresent || host.moving
    ? "remove"
    : "keep";
}
