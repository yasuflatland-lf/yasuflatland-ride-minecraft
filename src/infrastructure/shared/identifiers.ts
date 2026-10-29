/** Prefix of every ID this add-on defines. */
export const NAMESPACE = "yasu_ride";
export function id(name: string): string {
  return `${NAMESPACE}:${name}`;
}

/** The name after `yasu_ride:`, or undefined for an id in another namespace. */
export function bareId(typeId: string): string | undefined {
  const prefix = `${NAMESPACE}:`;
  return typeId.startsWith(prefix) ? typeId.slice(prefix.length) : undefined;
}

export const AIR_BLOCK = "minecraft:air";
/** Block tag on every block the add-on lays; a blade cut keeps blocks with it (ADR 0137). */
export const LAID_BLOCK_TAG = id("laid");

/** Lang key of an action bar message, yasu_ride.message.<name> (ADR 0063, 0068, 0092). */
export function messageKey(name: string): string {
  return `${NAMESPACE}.message.${name}`;
}

/** Item a rider uses to switch the headlights (ADR 0020). */
export const HEADLIGHT_SWITCH_TYPE = id("headlight_switch");
