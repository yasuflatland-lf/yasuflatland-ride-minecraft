// Colors an entity can be painted with dye (ADR 0031). A placed entity starts at
// variant 0, which shows the owner's default paint (ADR 0076).
// The order is the minecraft:variant index that entities in existing worlds store and that the paint
// events and render controller map to, so new paints go at the end.
export const PAINTS = [
  "khaki",
  "green",
  "red",
  "white",
  "light_gray",
  "gray",
  "black",
  "orange",
  "yellow",
  "lime",
  "cyan",
  "light_blue",
  "blue",
  "purple",
  "magenta",
  "pink",
] as const;
export type Paint = (typeof PAINTS)[number];

/** The paint an entity shows: the variant-0 slot shows the owner's default paint (ADR 0076). */
export function effectivePaint(paint: Paint, defaultPaint: Paint): Paint {
  return paint === PAINTS[0] ? defaultPaint : paint;
}

export const PAINT_EVENT_PREFIX = "paint_";

/** The entity event name (without namespace) that sets the variant for a paint (ADR 0031). */
export function paintEventName(paint: Paint): string {
  return `${PAINT_EVENT_PREFIX}${paint}`;
}
