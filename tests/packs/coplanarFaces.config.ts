export { PLANE_TOLERANCE } from "../support/modelFaces";

export const MIN_OVERLAP_AREA = 1e-4;
export const RGB_TOLERANCE = 12;

const campingGear = "textures/blocks/yasu_ride/camping_gear";
const entity = "textures/entity/yasu_ride";

export const GEOMETRY_TEXTURES: Record<string, string> = {
  "geometry.yasu_ride.alarm_clock": campingGear,
  "geometry.yasu_ride.beach_chair": `${entity}/beach_chair`,
  "geometry.yasu_ride.beach_parasol": `${entity}/beach_parasol`,
  "geometry.yasu_ride.binoculars": campingGear,
  "geometry.yasu_ride.board_decor_pair": campingGear,
  "geometry.yasu_ride.book_stack": campingGear,
  "geometry.yasu_ride.bulldozer": `${entity}/bulldozer`,
  "geometry.yasu_ride.bulldozer_monitor": `${entity}/bulldozer_monitor`,
  "geometry.yasu_ride.cactus_pot": campingGear,
  "geometry.yasu_ride.camp_table": `${entity}/camp_table`,
  "geometry.yasu_ride.camper": `${entity}/camper`,
  "geometry.yasu_ride.camper.drawer_items": campingGear,
  "geometry.yasu_ride.cushion": campingGear,
  "geometry.yasu_ride.desk_fan": campingGear,
  "geometry.yasu_ride.dining_chair": `${entity}/dining_chair`,
  "geometry.yasu_ride.dining_table": `${entity}/dining_table`,
  "geometry.yasu_ride.drawers_decor_pair": campingGear,
  "geometry.yasu_ride.dutch_oven": `${entity}/dutch_oven`,
  "geometry.yasu_ride.enamel_kettle": campingGear,
  "geometry.yasu_ride.fire_pit": `${entity}/fire_pit`,
  "geometry.yasu_ride.fruit_bowl": campingGear,
  "geometry.yasu_ride.gas_lantern": `${entity}/gas_lantern`,
  "geometry.yasu_ride.instant_camera": campingGear,
  "geometry.yasu_ride.low_chair": `${entity}/low_chair`,
  "geometry.yasu_ride.macrame_planter": campingGear,
  "geometry.yasu_ride.mug_pair": campingGear,
  "geometry.yasu_ride.noga_chair": `${entity}/noga_chair`,
  "geometry.yasu_ride.percolator": campingGear,
  "geometry.yasu_ride.photo_frame": campingGear,
  "geometry.yasu_ride.potted_plant": campingGear,
  "geometry.yasu_ride.road_map": campingGear,
  "geometry.yasu_ride.roof_tent": `${entity}/roof_tent`,
  "geometry.yasu_ride.roof_tent_suv": `${entity}/roof_tent`,
  "geometry.yasu_ride.saucepan": campingGear,
  "geometry.yasu_ride.scooter": `${entity}/scooter_fixed`,
  "geometry.yasu_ride.scooter_lit": `${entity}/scooter_lit`,
  "geometry.yasu_ride.scooter_paint": `${entity}/scooter_paint`,
  "geometry.yasu_ride.sofa_double": `${entity}/sofa_single`,
  "geometry.yasu_ride.sofa_single": `${entity}/sofa_single`,
  "geometry.yasu_ride.sportsboat": `${entity}/sportsboat`,
  "geometry.yasu_ride.sportsboat_monitor": `${entity}/sportsboat_monitor`,
  "geometry.yasu_ride.sugar_pot": campingGear,
  "geometry.yasu_ride.suv": `${entity}/suv`,
  "geometry.yasu_ride.table_decor_pair": campingGear,
  "geometry.yasu_ride.tent": `${entity}/tent`,
  "geometry.yasu_ride.tissue_box": campingGear,
  "geometry.yasu_ride.toaster": campingGear,
  "geometry.yasu_ride.toilet": `${entity}/toilet`,
  "geometry.yasu_ride.transistor_radio": campingGear,
  "geometry.yasu_ride.washstand": `${entity}/washstand`,
  "geometry.yasu_ride_test.cutout_probe":
    "textures/entity/yasu_ride_test/cutout_probe",
  "geometry.yasu_ride_test.rotation_probe":
    "textures/entity/yasu_ride_test/rotation_probe",
};

export type ExclusiveOption = { slot: string; option: string };
type ExclusiveBone = (bone: string) => ExclusiveOption | undefined;

const match =
  (pattern: RegExp): ExclusiveBone =>
  (bone) => {
    const [, slot, option] = pattern.exec(bone) ?? [];
    return slot && option ? { slot, option } : undefined;
  };

const decorPair = match(/^(end\d+)_(.+)$/);
const monitor = match(/^screen_(.+)_switch_(.+)$/);

export const EXCLUSIVE_BONES: Record<string, ExclusiveBone> = {
  "geometry.yasu_ride.board_decor_pair": decorPair,
  "geometry.yasu_ride.drawers_decor_pair": decorPair,
  "geometry.yasu_ride.table_decor_pair": decorPair,
  "geometry.yasu_ride.camper.drawer_items": match(
    /^drawer_(top|bottom)_item_(.+)$/,
  ),
  "geometry.yasu_ride.beach_chair": (bone) =>
    bone === "chair_form" || bone === "table_form"
      ? { slot: "form", option: bone }
      : undefined,
  "geometry.yasu_ride.bulldozer": (bone) =>
    bone === "blade" || bone === "blade_wide"
      ? { slot: "blade", option: bone }
      : undefined,
  "geometry.yasu_ride.bulldozer_monitor": monitor,
  "geometry.yasu_ride.sportsboat_monitor": monitor,
};
