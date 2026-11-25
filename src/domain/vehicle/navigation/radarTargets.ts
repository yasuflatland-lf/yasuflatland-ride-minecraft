export type RadarPlaceType =
  | "village"
  | "pillager_outpost"
  | "ocean_monument"
  | "woodland_mansion"
  | "witch_hut";

export const RADAR_TARGETS: readonly {
  place: RadarPlaceType;
  mobs: readonly string[];
}[] = [
  { place: "village", mobs: ["minecraft:villager_v2", "minecraft:iron_golem"] },
  { place: "pillager_outpost", mobs: ["minecraft:pillager"] },
  {
    place: "ocean_monument",
    mobs: ["minecraft:guardian", "minecraft:elder_guardian"],
  },
  {
    place: "woodland_mansion",
    mobs: ["minecraft:vindicator", "minecraft:evoker"],
  },
  { place: "witch_hut", mobs: ["minecraft:witch"] },
];
