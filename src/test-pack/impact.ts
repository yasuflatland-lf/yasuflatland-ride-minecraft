import { CAMPING_GEAR_IDS } from "../domain/vehicle/kinds/camper/campingGear.ts";
import type { ScenarioSpec } from "./catalog.ts";
import { CATALOG } from "./catalog.ts";
import type { FeatureTag } from "./features.ts";
import { FEATURE_TAGS, isFeatureTag } from "./features.ts";

export type Impact = "all" | "none" | readonly FeatureTag[];
interface ImpactRule {
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
  "src/application/shared/groundPlacement.ts",
  "src/application/shared/placeOnTop.ts",
  "src/application/shared/ports/groundCells.ts",
  "src/application/shared/ports/hostedItem.ts",
  "src/domain/camp/chair.ts",
  "src/domain/camp/spec.ts",
  "src/domain/camp/tent.ts",
  "src/domain/camp/tentLayout.ts",
  "src/domain/shared/cells.ts",
  "src/domain/shared/decorations.ts",
  "src/domain/shared/hitCounter.ts",
  "src/domain/shared/hosted.ts",
  "src/domain/shared/ids.ts",
  "src/domain/shared/keptBlocks.ts",
  "src/domain/shared/laidCells.ts",
  "src/domain/shared/paint.ts",
  "src/domain/shared/roofTent.ts",
  "src/domain/shared/switchCooldown.ts",
  "src/domain/shared/syncedValue.ts",
  "src/domain/shared/tableTop.ts",
  "src/domain/shared/tapToggle.ts",
  "src/domain/shared/vec.ts",
  "src/domain/vehicle/cooldowns.ts",
  "src/domain/vehicle/crew.ts",
  "src/domain/vehicle/cut.ts",
  "src/domain/vehicle/cutArea.ts",
  "src/domain/vehicle/dock/decor.ts",
  "src/domain/vehicle/dock/dock.ts",
  "src/domain/vehicle/dock/floor.ts",
  "src/domain/vehicle/dock/roomDrive.ts",
  "src/domain/vehicle/drive.ts",
  "src/domain/vehicle/driveInput.ts",
  "src/domain/vehicle/entityContract.ts",
  "src/domain/vehicle/fleet/fleet.ts",
  "src/domain/vehicle/hints.ts",
  "src/domain/vehicle/kind.ts",
  "src/domain/vehicle/kinds/bulldozer/blade.ts",
  "src/domain/vehicle/kinds/bulldozer/drive.ts",
  "src/domain/vehicle/kinds/bulldozer/entity.ts",
  "src/domain/vehicle/kinds/bulldozer/monitor.ts",
  "src/domain/vehicle/kinds/bulldozer/paver.ts",
  "src/domain/vehicle/kinds/bulldozer/profile.ts",
  "src/domain/vehicle/kinds/bulldozer/spec.ts",
  "src/domain/vehicle/kinds/bulldozer/tracks.ts",
  "src/domain/vehicle/kinds/camper/bodyGuard.ts",
  "src/domain/vehicle/kinds/camper/campingGear.ts",
  "src/domain/vehicle/kinds/camper/decor.ts",
  "src/domain/vehicle/kinds/camper/drawerHit.ts",
  "src/domain/vehicle/kinds/camper/decorPlacing.ts",
  "src/domain/vehicle/kinds/camper/doorSwing.ts",
  "src/domain/vehicle/kinds/camper/dooredStorage.ts",
  "src/domain/vehicle/kinds/camper/drive.ts",
  "src/domain/vehicle/kinds/camper/entity.ts",
  "src/domain/vehicle/kinds/camper/furniture.ts",
  "src/domain/vehicle/kinds/camper/profile.ts",
  "src/domain/vehicle/kinds/camper/parkPose.ts",
  "src/domain/vehicle/kinds/camper/roomGeometry.ts",
  "src/domain/vehicle/kinds/camper/roomCells.ts",
  "src/domain/vehicle/kinds/camper/decorCells.ts",
  "src/domain/vehicle/kinds/camper/storagePlates.ts",
  "src/domain/vehicle/kinds/camper/groundCheck.ts",
  "src/domain/vehicle/kinds/camper/seatPress.ts",
  "src/domain/vehicle/kinds/camper/spec.ts",
  "src/domain/vehicle/kinds/index.ts",
  "src/domain/vehicle/kinds/sportsboat/attitude.ts",
  "src/domain/vehicle/kinds/sportsboat/deck.ts",
  "src/domain/vehicle/kinds/sportsboat/drive.ts",
  "src/domain/vehicle/kinds/sportsboat/entity.ts",
  "src/domain/vehicle/kinds/sportsboat/equipment.ts",
  "src/domain/vehicle/kinds/sportsboat/icebreaker.ts",
  "src/domain/vehicle/kinds/sportsboat/profile.ts",
  "src/domain/vehicle/kinds/sportsboat/spec.ts",
  "src/domain/vehicle/kinds/sportsboat/surfacing.ts",
  "src/domain/vehicle/kinds/suv/drive.ts",
  "src/domain/vehicle/kinds/suv/entity.ts",
  "src/domain/vehicle/kinds/suv/profile.ts",
  "src/domain/vehicle/kinds/suv/spec.ts",
  "src/domain/vehicle/lighting/headlights.ts",
  "src/domain/vehicle/monitor/monitor.ts",
  "src/domain/vehicle/motion/bank.ts",
  "src/domain/vehicle/motion/constants.ts",
  "src/domain/vehicle/motion/dock.ts",
  "src/domain/vehicle/motion/dockEntity.ts",
  "src/domain/vehicle/motion/forms.ts",
  "src/domain/vehicle/motion/landingGear.ts",
  "src/domain/vehicle/motion/limits.ts",
  "src/domain/vehicle/motion/motion.ts",
  "src/domain/vehicle/motion/pivot.ts",
  "src/domain/vehicle/motion/stepUp.ts",
  "src/domain/vehicle/motion/submarine.ts",
  "src/domain/vehicle/motion/transforming.ts",
  "src/domain/vehicle/motion/transformingDrive.ts",
  "src/domain/vehicle/motion/transformingEntity.ts",
  "src/domain/vehicle/motion/turn.ts",
  "src/domain/vehicle/motion/water.ts",
  "src/domain/vehicle/pave.ts",
  "src/domain/vehicle/placement/gift.ts",
  "src/domain/vehicle/placement/placement.ts",
  "src/domain/vehicle/placement/starter.ts",
  "src/domain/vehicle/profile.ts",
  "src/domain/vehicle/ram.ts",
  "src/domain/vehicle/ramQuery.ts",
  "src/domain/vehicle/seatChoice.ts",
  "src/domain/vehicle/seating.ts",
  "src/domain/vehicle/seats.ts",
  "src/domain/vehicle/spec.ts",
  "src/domain/vehicle/standIn.ts",
  "src/domain/vehicle/vehicle.ts",
  "src/infrastructure/camp/identifiers.ts",
  "src/infrastructure/shared/identifiers.ts",
  "src/infrastructure/vehicle/bedrock/identifiers.ts",
];

export const PACK_STEM_TAGS: Readonly<Record<string, Impact>> = {
  ...Object.fromEntries(
    CAMPING_GEAR_IDS.flatMap((id) =>
      [id, `${id}_decor`].map((stem) => [stem, ["vehicle:camper"]]),
    ),
  ),
  dining_table_top: ["resort"],
  dining_table: ["resort"],
  dining_table_item: ["resort"],
  dining_chair: ["resort"],
  dining_chair_item: ["resort"],
  sofa_single: ["resort"],
  sofa_double: ["resort"],
  sofa_single_item: ["resort"],
  sofa_double_item: ["resort"],
  toilet: ["resort"],
  toilet_item: ["resort"],
  washstand: ["resort"],
  washstand_item: ["resort"],
  beach_chair: ["resort"],
  beach_chair_item: ["resort"],
  beach_parasol: ["resort"],
  beach_parasol_item: ["resort"],
  blade_switch: ["vehicle:bulldozer"],
  bulldozer: ["vehicle:bulldozer"],
  bulldozer_item: ["vehicle:bulldozer"],
  cabinet_decor_pair: ["vehicle:camper"],
  camp_table: ["camp"],
  camp_table_item: ["camp"],
  camper: ["vehicle:camper"],
  // Build scenarios use this laid block to verify edit protection without a vehicle.
  camper_bed: ["vehicle:camper", "build"],
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
  deck_floor: ["vehicle:camper", "vehicle:sportsboat"],
  deck_seat: ["vehicle:camper", "vehicle:sportsboat"],
  dutch_oven: ["camp"],
  dutch_oven_item: ["camp"],
  // Camera presets are shared by build tools and vehicles.
  far_chase: "all",
  fire_pit: ["camp"],
  fire_pit_item: ["camp"],
  fridge_decor_pair: ["vehicle:camper"],
  drawers_decor_pair: ["vehicle:camper"],
  drawer_probe: ["vehicle:camper"],
  gas_lantern: ["camp"],
  gas_lantern_item: ["camp"],
  headlight_switch: ["vehicle", "camp"],
  icebreaker_switch: ["vehicle:sportsboat"],
  low_chair: ["camp"],
  low_chair_item: ["camp"],
  // Camera presets are shared by build tools and vehicles.
  mid_chase: "all",
  noga_chair: ["camp"],
  noga_chair_item: ["camp"],
  parasol_ceiling: ["resort"],
  road_paver_switch: ["vehicle:bulldozer"],
  seat_filler: ["vehicle:sportsboat"],
  shelf_decor_pair: ["vehicle:camper"],
  sportsboat: ["vehicle:sportsboat"],
  sportsboat_equipment_box: ["vehicle:sportsboat"],
  sportsboat_item: ["vehicle:sportsboat"],
  suv: ["vehicle:suv"],
  suv_item: ["vehicle:suv"],
  table_decor_pair: ["vehicle:camper"],
  roof_tent: ["camp", "vehicle:suv", "vehicle:camper"],
  roof_tent_item: ["camp", "vehicle:suv", "vehicle:camper"],
  tent: ["camp"],
  tent_ceiling: ["camp"],
  tent_flap: ["camp"],
  tent_item: ["camp"],
  tent_lantern: ["camp"],
  tent_mattress: ["camp"],
  tent_wall: ["camp"],
  wide_blade_switch: ["vehicle:bulldozer"],
};

function ownValue<T>(
  table: Readonly<Record<string, T>>,
  key: string,
): T | undefined {
  return Object.hasOwn(table, key) ? table[key] : undefined;
}

function packStemImpact(m: RegExpMatchArray): Impact {
  return ownValue(PACK_STEM_TAGS, m[1] ?? "") ?? "all";
}

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
const IMPACT_RULES: readonly ImpactRule[] = [
  {
    rule: "registry",
    test: /^src\/test-pack\/(?:catalog|scenarios\/index)\.ts$/,
    impact: "none",
  },
  { rule: "harness-import", test: exactPaths(HARNESS_IMPORTS), impact: "all" },
  {
    rule: "camper-identifiers",
    test: /^src\/infrastructure\/vehicle\/kinds\/camper\/identifiers\.ts$/,
    impact: "all",
  },
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
    rule: "resort",
    test: /^src\/(?:domain|application|infrastructure)\/resort\//,
    impact: ["resort"],
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
        ownValue(MOTION_TAGS, stem) ??
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
    impact: packStemImpact,
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
    impact: packStemImpact,
  },
  {
    rule: "resource-pack",
    test: /^packs\/yasu_ride_(?:test_)?rp\//,
    impact: "none",
  },
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
