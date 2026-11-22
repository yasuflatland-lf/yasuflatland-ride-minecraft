import type { RGB } from "@minecraft/server";
import { buildId } from "../identifiers";

export const MARKER_PARTICLE = buildId("marker");

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
