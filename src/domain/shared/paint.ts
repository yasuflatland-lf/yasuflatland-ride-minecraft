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

export type PaintPolicy =
  | { kind: "dyeable"; defaultPaint: Paint }
  | { kind: "fixed"; paint: Paint };

export function dyeable(defaultPaint: Paint): PaintPolicy {
  return { kind: "dyeable", defaultPaint };
}

export function fixed(paint: Paint): PaintPolicy {
  return { kind: "fixed", paint };
}

export function isDyeable(policy: PaintPolicy): boolean {
  return policy.kind === "dyeable";
}

export function shownPaint(policy: PaintPolicy, stored: Paint): Paint {
  return policy.kind === "fixed"
    ? policy.paint
    : effectivePaint(stored, policy.defaultPaint);
}
