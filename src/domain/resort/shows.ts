import { soundId } from "../shared/soundId";
import { ticks } from "../shared/ticks";

export const TOILET_SPEC = Object.freeze({
  flushTicks: ticks(100),
  lidOpenTicks: ticks(8),
  lidOpenDegrees: 91,
  scanTicks: ticks(2),
  // Keep the front exit search independent of other furniture tuning (ADR 0050).
  exitFrontOffset: 1,
  exitSearchRadius: 4,
  exitSearchUp: 4,
  exitSearchDown: 8,
  flushSound: soundId("yasu_ride.toilet_flush"),
});

export const WASHSTAND_SPEC = Object.freeze({
  runTicks: ticks(100),
  runSound: soundId("yasu_ride.washstand_water"),
});
