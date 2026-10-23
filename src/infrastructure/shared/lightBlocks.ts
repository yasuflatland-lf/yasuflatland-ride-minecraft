// Light blocks: invisible, not solid, and treated as air by the scripts (ADR 0020, 0115).

/** Block id of a light block emitting `level` (an integer from 0 to 15). */
export function lightBlockId(level: number): string {
  if (!Number.isInteger(level) || level < 0 || level > 15) {
    throw new RangeError("Light block level must be an integer from 0 to 15");
  }
  return `minecraft:light_block_${level}`;
}

/** The full-brightness light block the headlights and the camper's ceiling light lay. */
export const LIGHT_BLOCK = lightBlockId(15);

/** Light blocks are not solid and a player cannot see them, so the scripts treat them as air. */
export const isLightBlock = (b: { readonly typeId: string }): boolean =>
  b.typeId.startsWith("minecraft:light_block");
