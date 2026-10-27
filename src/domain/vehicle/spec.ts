// Tuning values the vehicle core reads (ADR 0055). See docs/adr/0002-0008 for the rationale.
import { LIGHT_SWITCH_COOLDOWN_TICKS } from "../shared/switchCooldown";

export const SPEC = Object.freeze({
  // Input (ADR 0018)
  throttleDeadzone: 0.1,
  throttleFullAt: 0.5,
  sidewaysAngle: 20, // degrees from horizontal within which the stick only steers and creeps
  // Collisions (ADR 0006)
  targetHalfWidth: 0.45,
  ramMinSpeed: 0.15,
  ramCooldown: 10,
  ramDamagePerSpeed: 20,
  ramPushBase: 0.5,
  ramPushPerSpeed: 2.5,
  ramPushUp: 0.35,
  ramMinDy: -0.5,
  ramMaxDy: 1.8,
  // Placing and picking up vehicles (ADR 0008)
  placementWaterClimb: 16, // cells a placement climbs a water column to find its surface (ADR 0051)
  hitsToBreak: 3,
  hitResetTicks: 100,
  headlightSwitchCooldown: LIGHT_SWITCH_COOLDOWN_TICKS,
  toolSwitchCooldown: LIGHT_SWITCH_COOLDOWN_TICKS, // shared by monitor tools, separate from lights (ADR 0171)
  waterBreathingInterval: 20, // ticks
  waterBreathingTicks: 60, // ticks
  // Driver handover in flight (ADR 0078)
  driverHandoverTicks: 6, // ticks; Bedrock moves a passenger into seat 0 within 5 ticks (ADR 0019), plus one of margin
  // Vehicle limit (ADR 0038, ADR 0066)
  maxUnownedVehicles: 10, // vehicles with no owner (summoned, or placed before ADR 0066), all kinds together
  maxEvicted: 64, // evicted vehicles remembered until their chunk loads; one dropped from the list joins again as the oldest when it loads
  // Hints near a vehicle (ADR 0086)
  hintCheckInterval: 5, // ticks; 0.25 s is quick enough for a walking player and spares the per-tick scan
  hintRefreshTicks: 40, // ticks; assumes the action bar stays up longer than 2 s, which is undocumented and not yet measured (ADR 0086)
  hintShowTicks: 100, // ticks a hint keeps being re-sent after a player comes near; then it fades until they leave or pick up another item
  hintExitMargin: 0.5, // blocks past the reach a shown hint keeps showing, so standing on the edge does not flicker
} as const);
