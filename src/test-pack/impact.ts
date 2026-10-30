// The temporary knip.json entry is removed by 14/22 (#922), which wires this into game-test.mjs.
import type { ScenarioSpec } from "./catalog.ts";
import { CATALOG } from "./catalog.ts";
import type { FeatureTag } from "./features.ts";
import { FEATURE_TAGS, isFeatureTag } from "./features.ts";

export type Impact = "all" | "none" | readonly FeatureTag[];
export interface ImpactRule {
  readonly rule: string;
  readonly test: RegExp;
  readonly impact: Impact | ((m: RegExpMatchArray) => Impact);
}
export interface Ruled {
  readonly impact: Impact;
  readonly rule: string;
}

export function scenarioFileTags(
  catalog: readonly ScenarioSpec[],
): Readonly<Record<string, readonly FeatureTag[]>> {
  const files = new Map<string, Set<FeatureTag>>();
  for (const spec of catalog) {
    const tags = files.get(spec.file) ?? new Set<FeatureTag>();
    for (const tag of spec.features) tags.add(tag);
    files.set(spec.file, tags);
  }
  return Object.fromEntries(
    [...files].map(([file, tags]) => [
      file,
      FEATURE_TAGS.filter((tag) => tags.has(tag)),
    ]),
  );
}

const transforming: readonly FeatureTag[] = [
  "vehicle:suv",
  "vehicle:camper",
  "vehicle:bulldozer",
];
export const MOTION_TAGS: Readonly<Record<string, readonly FeatureTag[]>> = {
  pivot: ["vehicle:bulldozer"],
  dock: ["vehicle:camper", "vehicle:sportsboat"],
  dockEntity: ["vehicle:camper", "vehicle:sportsboat"],
  transforming,
  transformingDrive: transforming,
  transformingEntity: transforming,
  forms: transforming,
  bank: transforming,
  landingGear: transforming,
  stepUp: transforming,
  submarine: transforming,
};

export const HARNESS_IMPORTS: readonly string[] = [
  "src/infrastructure/camp/identifiers.ts",
  "src/infrastructure/vehicle/bedrock/identifiers.ts",
  "src/domain/shared/vec.ts",
  "src/domain/vehicle/kinds/suv/entity.ts",
  "src/domain/vehicle/motion/forms.ts",
];

export const PACK_STEM_TAGS: Readonly<Record<string, Impact>> = {
  blade_switch: ["vehicle:bulldozer"],
  book_stack: ["vehicle:camper"],
  book_stack_decor: ["vehicle:camper"],
  bulldozer: ["vehicle:bulldozer"],
  bulldozer_item: ["vehicle:bulldozer"],
  cabinet_decor_pair: ["vehicle:camper"],
  cactus_pot: ["vehicle:camper"],
  cactus_pot_decor: ["vehicle:camper"],
  camp_table: ["camp"],
  camp_table_item: ["camp"],
  camper: ["vehicle:camper"],
  camper_bed: ["vehicle:camper"],
  camper_bumper_x: ["vehicle:camper"],
  camper_bumper_z: ["vehicle:camper"],
  camper_bunk: ["vehicle:camper"],
  camper_cabinet_door: ["vehicle:camper"],
  camper_ceiling: ["vehicle:camper"],
  camper_door: ["vehicle:camper"],
  camper_floor: ["vehicle:camper"],
  camper_fridge_door: ["vehicle:camper"],
  camper_furniture: ["vehicle:camper"],
  camper_item: ["vehicle:camper"],
  camper_shower_door: ["vehicle:camper"],
  camper_shower_toilet: ["vehicle:camper"],
  camper_wall: ["vehicle:camper"],
  camping_gear_box: ["vehicle:camper"],
  cushion: ["vehicle:camper"],
  cushion_decor: ["vehicle:camper"],
  deck_floor: ["vehicle:camper", "vehicle:sportsboat"],
  deck_seat: ["vehicle:camper", "vehicle:sportsboat"],
  desk_fan: ["vehicle:camper"],
  desk_fan_decor: ["vehicle:camper"],
  dutch_oven: ["camp"],
  dutch_oven_item: ["camp"],
  enamel_kettle: ["vehicle:camper"],
  enamel_kettle_decor: ["vehicle:camper"],
  // Camera presets are shared by build tools and vehicles.
  far_chase: "all",
  fire_pit: ["camp"],
  fire_pit_item: ["camp"],
  fridge_decor_pair: ["vehicle:camper"],
  fruit_bowl: ["vehicle:camper"],
  fruit_bowl_decor: ["vehicle:camper"],
  gas_lantern: ["camp"],
  gas_lantern_item: ["camp"],
  headlight_switch: ["vehicle", "camp"],
  icebreaker_switch: ["vehicle:sportsboat"],
  low_chair: ["camp"],
  low_chair_item: ["camp"],
  macrame_planter: ["vehicle:camper"],
  macrame_planter_decor: ["vehicle:camper"],
  // Camera presets are shared by build tools and vehicles.
  mid_chase: "all",
  mug_pair: ["vehicle:camper"],
  mug_pair_decor: ["vehicle:camper"],
  noga_chair: ["camp"],
  noga_chair_item: ["camp"],
  percolator: ["vehicle:camper"],
  percolator_decor: ["vehicle:camper"],
  photo_frame: ["vehicle:camper"],
  photo_frame_decor: ["vehicle:camper"],
  potted_plant: ["vehicle:camper"],
  potted_plant_decor: ["vehicle:camper"],
  road_map: ["vehicle:camper"],
  road_map_decor: ["vehicle:camper"],
  road_paver_switch: ["vehicle:bulldozer"],
  saucepan: ["vehicle:camper"],
  saucepan_decor: ["vehicle:camper"],
  seat_filler: ["vehicle:sportsboat"],
  shelf_decor_pair: ["vehicle:camper"],
  sportsboat: ["vehicle:sportsboat"],
  sportsboat_equipment_box: ["vehicle:sportsboat"],
  sportsboat_item: ["vehicle:sportsboat"],
  sugar_pot: ["vehicle:camper"],
  sugar_pot_decor: ["vehicle:camper"],
  suv: ["vehicle:suv"],
  suv_item: ["vehicle:suv"],
  table_decor_pair: ["vehicle:camper"],
  tent: ["camp"],
  tent_ceiling: ["camp"],
  tent_flap: ["camp"],
  tent_item: ["camp"],
  tent_lantern: ["camp"],
  tent_mattress: ["camp"],
  tent_wall: ["camp"],
  tissue_box: ["vehicle:camper"],
  tissue_box_decor: ["vehicle:camper"],
  toaster: ["vehicle:camper"],
  toaster_decor: ["vehicle:camper"],
  transistor_radio: ["vehicle:camper"],
  transistor_radio_decor: ["vehicle:camper"],
  wide_blade_switch: ["vehicle:bulldozer"],
};

function exactPaths(paths: readonly string[]): RegExp {
  return new RegExp(
    `^(?:${paths.map((path) => path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})$`,
  );
}

function mappedRules(
  table: Readonly<Record<string, Impact>>,
  prefix: string,
  suffix: string,
  rule: string,
): ImpactRule[] {
  return Object.entries(table).map(([stem, impact]) => ({
    rule,
    test: exactPaths([prefix + stem + suffix]),
    impact,
  }));
}

const scenarioTags = scenarioFileTags(CATALOG);
export const IMPACT_RULES: readonly ImpactRule[] = [
  {
    rule: "registry",
    test: /^src\/test-pack\/(?:catalog|scenarios\/index)\.ts$/,
    impact: "none",
  },
  { rule: "harness-import", test: exactPaths(HARNESS_IMPORTS), impact: "all" },
  {
    rule: "entry",
    test: /^src\/(?:main|infrastructure\/bootstrap)\.ts$/,
    impact: "all",
  },
  { rule: "install", test: /^src\/[^/]+\/[^/]+\/install\.ts$/, impact: "all" },
  {
    rule: "shared",
    test: /^src\/(?:domain|application|infrastructure)\/shared\//,
    impact: "all",
  },
  {
    rule: "harness",
    test: /^src\/test-pack\/(?:scenarios\/shared\.ts$|[^/]+$)/,
    impact: "all",
  },
  {
    rule: "pack-manifest",
    test: /^packs\/[^/]+\/manifest\.json$/,
    impact: "all",
  },
  { rule: "test-pack", test: /^packs\/yasu_ride_test_bp\//, impact: "all" },
  {
    rule: "dependencies",
    test: /^(?:package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|\.pnpmfile\.cjs|mise\.toml|tsconfig\.json)$|^patches\//,
    impact: "all",
  },
  {
    rule: "runtime-script",
    test: /^scripts\/(?:build|game-test|setup-dev-world|dev-pack-version|server-up)\.mjs$/,
    impact: "all",
  },
  { rule: "server", test: /^server\//, impact: "all" },
  ...mappedRules(scenarioTags, "src/test-pack/scenarios/", ".ts", "scenario"),
  {
    rule: "build",
    test: /^src\/(?:domain|application|infrastructure)\/build\//,
    impact: ["build"],
  },
  {
    rule: "camp",
    test: /^src\/(?:domain|application|infrastructure)\/camp\//,
    impact: ["camp"],
  },
  {
    rule: "kind-registry",
    test: /^src\/domain\/vehicle\/kinds\/index\.ts$/,
    impact: ["vehicle"],
  },
  {
    rule: "kind",
    test: /^src\/domain\/vehicle\/kinds\/([^/]+)\//,
    impact: (m) => {
      const tag = `vehicle:${m[1]}`;
      return isFeatureTag(tag) ? [tag] : "all";
    },
  },
  {
    rule: "motion",
    test: /^src\/domain\/vehicle\/motion\/([^/]+)\.ts$/,
    impact: (m) => {
      const stem = m[1] ?? "";
      return (
        (Object.hasOwn(MOTION_TAGS, stem) ? MOTION_TAGS[stem] : undefined) ??
        (stem.startsWith("transforming") ? transforming : ["vehicle"])
      );
    },
  },
  {
    rule: "vehicle",
    test: /^src\/(?:domain|application|infrastructure)\/vehicle\//,
    impact: ["vehicle"],
  },
  {
    rule: "build-pack",
    test: /^packs\/yasu_ride_bp\/[^/]+\/yasu_build\//,
    impact: ["build"],
  },
  {
    rule: "pack-stem",
    test: /^packs\/yasu_ride_bp\/[^/]+\/yasu_ride\/([^/.]+)\./,
    impact: (m) =>
      Object.hasOwn(PACK_STEM_TAGS, m[1] ?? "")
        ? (PACK_STEM_TAGS[m[1] ?? ""] ?? "all")
        : "all",
  },
  {
    rule: "camera",
    test: /^packs\/yasu_ride_bp\/cameras\//,
    impact: ["build", "vehicle"],
  },
  {
    rule: "crafting",
    test: /^packs\/yasu_ride_bp\/(?:recipes|item_catalog)\//,
    impact: "none",
  },
  {
    rule: "generated-scripts",
    test: /^packs\/[^/]+\/scripts\//,
    impact: "none",
  },
  {
    rule: "block-model",
    test: /^packs\/yasu_ride_rp\/models\/blocks\/(?:yasu_ride\/)?([^/.]+)\./,
    impact: (m) =>
      Object.hasOwn(PACK_STEM_TAGS, m[1] ?? "")
        ? (PACK_STEM_TAGS[m[1] ?? ""] ?? "all")
        : "all",
  },
  { rule: "resource-pack", test: /^packs\/yasu_ride_rp\//, impact: "none" },
  // The Behavior Pack icon belongs to the whole add-on.
  {
    rule: "pack-icon",
    test: /^packs\/yasu_ride_bp\/pack_icon\.png$/,
    impact: "all",
  },
  {
    rule: "camping-gear",
    test: /^tools\/camping_gear\.json$/,
    impact: ["vehicle:camper"],
  },
  { rule: "tools", test: /^tools\//, impact: "none" },
  {
    rule: "documentation",
    test: /^(?:docs|tests|\.github|\.claude)\/|\.md$/,
    impact: "none",
  },
  {
    rule: "checks",
    test: /^(?:biome\.json|knip\.json|stryker\.config\.mjs|\.dependency-cruiser\.cjs|vitest\.config\.ts)$/,
    impact: "none",
  },
  { rule: "scripts", test: /^scripts\//, impact: "none" },
  { rule: "unmapped", test: /^/, impact: "all" },
];

export function impactOfPath(path: string): Ruled {
  for (const { rule, test, impact } of IMPACT_RULES) {
    const match = path.match(test);
    if (match)
      return {
        rule,
        impact: typeof impact === "function" ? impact(match) : impact,
      };
  }
  return { rule: "unmapped", impact: "all" };
}

export type Selection =
  | { readonly all: true; readonly reason: string }
  | { readonly all: false; readonly features: readonly FeatureTag[] };

export function selectionOf(paths: readonly string[]): Selection {
  const tags = new Set<FeatureTag>();
  for (const path of paths) {
    const { impact, rule } = impactOfPath(path);
    if (impact === "all") return { all: true, reason: `${path} (${rule})` };
    if (impact !== "none") for (const tag of impact) tags.add(tag);
  }
  return { all: false, features: FEATURE_TAGS.filter((tag) => tags.has(tag)) };
}

export function mustRunAll(
  env: Readonly<Record<string, string | undefined>>,
): string | undefined {
  if (env.CI) return "CI";
  if (env.GAME_TEST_SHARD) return "GAME_TEST_SHARD";
  if (env.GAME_TEST_ALL === "1") return "GAME_TEST_ALL=1";
  return undefined;
}
