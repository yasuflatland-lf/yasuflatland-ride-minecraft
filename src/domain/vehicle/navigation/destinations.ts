export const NAV_DESTINATIONS = [
  "buriedtreasure",
  "mansion",
  "monument",
  "village",
  "jungle_temple",
  "swamp_hut",
  "trial_chambers",
  "pillager_outpost",
  "shipwreck",
  "ruins",
] as const;
export type NavDestination = (typeof NAV_DESTINATIONS)[number];
