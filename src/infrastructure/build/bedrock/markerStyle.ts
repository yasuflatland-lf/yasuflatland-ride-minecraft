import type { RGB } from "@minecraft/server";
import { buildId } from "../identifiers";

export const MARKER_PARTICLE = buildId("marker");
// Outlines use a larger copy of the marker: at the marker's 0.1 size they read as faint dots on iPad.
export const OUTLINE_PARTICLE = buildId("outline");

export const MARKER_COLORS: Readonly<
  Record<"startMarker" | "endMarker" | "sharedMarker", RGB>
> = {
  startMarker: { red: 1, green: 1, blue: 1 },
  endMarker: { red: 1, green: 0.15, blue: 0.15 },
  sharedMarker: { red: 1, green: 0.55, blue: 0 },
};

// The vanilla villager_happy star is lit by the world, so it faded at night.
// The marker particle keeps the tint it is given, so outlines use it too.
export const OUTLINE_COLOR: RGB = { red: 0.25, green: 1, blue: 0.35 };
