// Where each camping gear item may stand, copied from tools/camping_gear.json
// (ADR 0093); tests/domain/vehicle/kinds/camper/campingGear.test.ts keeps the two equal.
import type { FurnitureKind } from "./furniture";

export const CAMPING_GEAR: ReadonlyMap<string, readonly FurnitureKind[]> =
  new Map<string, readonly FurnitureKind[]>([
    ["potted_plant", ["table", "shelf"]],
    ["macrame_planter", ["ceiling_hook"]],
    ["cactus_pot", ["shelf", "table"]],
    ["percolator", ["stove"]],
    ["enamel_kettle", ["stove"]],
    ["saucepan", ["stove"]],
    ["mug_pair", ["table", "counter"]],
    ["sugar_pot", ["counter"]],
    ["fruit_bowl", ["table"]],
    ["toaster", ["counter"]],
    ["oil_lamp", ["table", "shelf"]],
    ["lava_lamp", ["shelf"]],
    ["transistor_radio", ["shelf", "dashboard"]],
    ["book_stack", ["shelf", "table"]],
    ["road_map", ["table", "dashboard"]],
    ["photo_frame", ["shelf"]],
    ["cushion", ["dinette_seat"]],
    ["tissue_box", ["dashboard", "shelf"]],
    ["desk_fan", ["counter", "dashboard"]],
  ]);

/** Every camping gear id, in the order of tools/camping_gear.json. */
export const CAMPING_GEAR_IDS: readonly string[] = Object.freeze([
  ...CAMPING_GEAR.keys(),
]);
