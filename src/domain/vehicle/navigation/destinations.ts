// ADR 0261 requires a filled map and a verified player origin before enabling a destination.
export const NAV_DESTINATIONS = [] as const;
export type NavDestination = (typeof NAV_DESTINATIONS)[number];
