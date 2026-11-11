// Registry of the spike items. Each item module `./<id>.js` default-exports
// { build(THREE, L) -> THREE.Group } in Bedrock pixels (16 px = 1 block), front = -z, origin at the
// middle of the base (x, z) and y = 0 on the floor. A missing module shows a grey bounding box.
// `px` is [width, height] in pixels from tools/camping_gear.json: the size stays as it is today.
export const ITEMS = [
  { id: "percolator", name: "Percolator", px: [4, 7], refs: ["percolator1", "percolator2", "percolator3", "percolator_front", "percolator_back", "percolator_inside", "percolator_blueprint"] },
  { id: "enamel_kettle", name: "Enamel Kettle", px: [5, 5], refs: ["enamel_kettle", "enamel_kettle_top", "enamel_kettle_closeup", "enamel_kettle_closeup_top"] },
  { id: "saucepan", name: "Saucepan", px: [6, 3], refs: ["saucepan"] },
  { id: "mug_pair", name: "Pair of Mugs", px: [4, 3], refs: ["pair_of_mugs", "mug_closeup"] },
  { id: "sugar_pot", name: "Glass Sugar Pot", px: [3, 4], refs: ["glass_sugar_pot", "glass_sugar_pot_with_suger", "glass_sugar_pot_with_suger_side"] },
  { id: "toaster", name: "Chrome Toaster", px: [6, 5], refs: ["chrome_toaster", "chrome_toaster_front", "chrome_toaster_back", "chrome_toaster_front_closeup", "chrome_toaster_front_all", "chrome_toaster_front_with_breads"] },
  { id: "transistor_radio", name: "Transistor Radio", px: [6, 4], refs: ["transistor_radio", "transistor_radio_top", "transistor_radio_top2"] },
  { id: "potted_plant", name: "Potted Plant", px: [5, 8], refs: ["potted_plant"] },
  { id: "cactus_pot", name: "Cactus Pot", px: [4, 7], refs: ["cactus_pot"] },
  { id: "macrame_planter", name: "Macrame Hanging Planter", px: [5, 10], hanging: true, refs: ["macrame_hanging_planter", "macrame_hanging_planter_closeup"] },
];
