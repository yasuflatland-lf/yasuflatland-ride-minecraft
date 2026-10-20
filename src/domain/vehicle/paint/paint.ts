// Body colors a vehicle can be painted with dye (ADR 0031). A placed vehicle starts at
// variant 0, which shows its kind's default paint (ADR 0076).
// The order is the minecraft:variant index that vehicles in existing worlds store and that the paint
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

/** The paint a vehicle shows: the variant-0 slot shows its kind's default paint (ADR 0076). */
export function effectivePaint(paint: Paint, defaultPaint: Paint): Paint {
  return paint === PAINTS[0] ? defaultPaint : paint;
}
