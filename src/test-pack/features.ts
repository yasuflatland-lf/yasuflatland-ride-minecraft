export const FEATURE_TAGS = [
  "build",
  "camp",
  "vehicle",
  "vehicle:suv",
  "vehicle:camper",
  "vehicle:sportsboat",
  "vehicle:bulldozer",
] as const;

export type FeatureTag = (typeof FEATURE_TAGS)[number];

export function isFeatureTag(text: string): text is FeatureTag {
  return FEATURE_TAGS.some((tag) => tag === text);
}

export function covers(changed: FeatureTag, scenarioTag: FeatureTag): boolean {
  return (
    changed === scenarioTag ||
    (changed === "vehicle" && scenarioTag.startsWith("vehicle:"))
  );
}
