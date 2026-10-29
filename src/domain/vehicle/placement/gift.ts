// What a player gets, once, the first time they place a vehicle of a kind (ADR 0093).

export const PLACEMENT_GIFTS = [
  "camping_gear_box",
  "sportsboat_equipment_box",
] as const;
export type PlacementGift = (typeof PLACEMENT_GIFTS)[number];
