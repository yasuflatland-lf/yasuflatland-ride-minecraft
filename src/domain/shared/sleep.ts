// Sleeping in a bed block laid by any feature: the camper bed, later the tent mattresses (ADR 0092).

export const SLEEP = Object.freeze({
  // The night window the camper spike slept through (docs/spike-camper.md).
  nightStart: 12542,
  nightEnd: 23459,
  wakeTime: 0, // 6:00 in the morning
  fadeInSeconds: 0.5,
  holdSeconds: 1,
  fadeOutSeconds: 0.5,
  // The end of the fade-in at 20 ticks per second, so the sky changes while the screen is black.
  wakeDelayTicks: 10,
  dimension: "minecraft:overworld",
});

/** Names of the bed's action bar messages (lang keys yasu_ride.message.<name>). */
export const SLEEP_MESSAGES = Object.freeze({
  nightOnly: "sleep_at_night",
});

/** Whether a bed can be slept in at `timeOfDay` (0 to 23999). */
export function canSleep(timeOfDay: number): boolean {
  return timeOfDay >= SLEEP.nightStart && timeOfDay <= SLEEP.nightEnd;
}
