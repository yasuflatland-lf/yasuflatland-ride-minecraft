/** Prefix of every ID this add-on defines. */
export const NAMESPACE = "yasu_ride";
export function id(name: string): string {
  return `${NAMESPACE}:${name}`;
}

export const AIR_BLOCK = "minecraft:air";

/** Lang key of an action bar message, yasu_ride.message.<name> (ADR 0063, 0068, 0092). */
export function messageKey(name: string): string {
  return `${NAMESPACE}.message.${name}`;
}

/** Item a rider uses to switch the headlights (ADR 0020). */
export const HEADLIGHT_SWITCH_TYPE = id("headlight_switch");
