import type { RGB } from "@minecraft/server";
import { buildId } from "../identifiers";

export const MARKER_PARTICLE = buildId("marker");
export const OUTLINE_PARTICLE = buildId("outline");

export const MARKER_COLORS: Readonly<
  Record<"startMarker" | "endMarker" | "sharedMarker", RGB>
> = {
  startMarker: { red: 1, green: 1, blue: 1 },
  endMarker: { red: 1, green: 0.35, blue: 0.35 },
  sharedMarker: { red: 1, green: 0.7, blue: 0.2 },
};

// The vanilla villager_happy star is lit by the world, so it faded at night.
// The custom outline particle keeps its green tint in the dark.
export const OUTLINE_COLOR: RGB = { red: 0.25, green: 1, blue: 0.35 };
