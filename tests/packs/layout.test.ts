import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { type Json, jsonFileEntries, packFiles } from "../support/packFiles";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PACKS = [
  {
    folder: "yasu_ride_test_rp",
    namespaces: ["yasu_ride_test"],
    resource: true,
  },
  {
    folder: "yasu_ride_bp",
    namespaces: ["yasu_ride", "yasu_build"],
    resource: false,
  },
  {
    folder: "yasu_ride_rp",
    namespaces: ["yasu_ride", "yasu_build"],
    resource: true,
  },
  {
    folder: "yasu_ride_test_bp",
    namespaces: ["yasu_ride_test"],
    resource: false,
  },
];
const MAX_PATH_LENGTH = 80;
const NAMESPACES = new Set(PACKS.flatMap((pack) => pack.namespaces));
// Bedrock looks up these files at fixed paths rather than content paths (ADR 0047).
const ENGINE_FIXED_FILES = new Set([
  "manifest.json",
  "texts/languages.json",
  "textures/item_texture.json",
  "item_catalog/crafting_item_catalog.json",
  "textures/terrain_texture.json",
  "textures/flipbook_textures.json",
  "sounds/sound_definitions.json",
  "sounds.json",
  "pack_icon.png",
]);

const versionsBySuffix = new Map<string, string | number>([
  [".ac.json", "1.10.0"],
  [".anim.json", "1.8.0"],
  [".block.json", "1.21.80"],
  [".ce.json", "1.10.0"],
  [".geo.json", "1.12.0"],
  [".item.json", "1.21.80"],
  [".particle.json", "1.10.0"],
  [".rc.json", "1.8.0"],
  [".recipe.json", "1.20.10"],
  // On 1.21.0, falling could kill the bulldozer despite its damage sensor.
  [".se.json", "1.21.80"],
  [".texture_set.json", "1.16.100"],
  ["manifest.json", 2],
  ["item_catalog/crafting_item_catalog.json", "1.21.60"],
  ["sounds/sound_definitions.json", "1.14.0"],
]);

const versionOverrides = new Map([
  // Custom billboard direction requires particle format 1.20.0.
  ["yasu_ride_rp/particles/yasu_build/marker.particle.json", "1.20.0"],
  // ADR 0238 keeps the vanilla player definition at its upstream format.
  ["yasu_ride_rp/entity/yasu_ride/player.ce.json", "1.26.0"],
  // The Warp Block uses the direct custom component syntax.
  ["yasu_ride_bp/blocks/yasu_build/warp_block.block.json", "1.21.100"],
  // Vehicle chase cameras use the preset schema added in 1.21.40.
  ["yasu_ride_bp/cameras/presets/yasu_ride/far_chase.json", "1.21.40"],
  ["yasu_ride_bp/cameras/presets/yasu_ride/mid_chase.json", "1.21.40"],
  // These recipes were authored against the newer version of the recipe schema.
  ...["fire_pit", "gas_lantern", "dutch_oven", "toilet"].map(
    (item) =>
      [
        `yasu_ride_bp/recipes/yasu_ride/${item}_item.recipe.json`,
        "1.21.80",
      ] as const,
  ),
]);

const versionedFiles = PACKS.flatMap(({ folder }) =>
  jsonFileEntries(join(REPO_ROOT, "packs", folder)).flatMap(
    ({ path, json }) => {
      const qualifiedPath = `${folder}/${path}`;
      const expected =
        versionOverrides.get(qualifiedPath) ??
        [...versionsBySuffix].find(([suffix]) => path.endsWith(suffix))?.[1];
      return expected !== undefined || json.format_version !== undefined
        ? [{ path: qualifiedPath, actual: json.format_version, expected }]
        : [];
    },
  ),
);

it("checks format versions for at least 354 pack files", () => {
  expect(versionedFiles.length).toBeGreaterThanOrEqual(354);
  expect(versionedFiles.map(({ path }) => path)).toEqual(
    expect.arrayContaining([...versionOverrides.keys()]),
  );
});

it.each(versionedFiles)(
  "$path uses its expected format version",
  ({ actual, expected }) => {
    expect(expected, "add a format version rule for this file").toBeDefined();
    expect(actual).toBe(expected);
  },
);

interface Definition {
  kind: string;
  identifier: string;
  path: string;
  dotted: boolean;
}

function definitions(
  path: string,
  json: Json,
  resource: boolean,
): Definition[] {
  const found: Definition[] = [];
  const addDescription = (kind: string, value: unknown, dotted = false) => {
    const definition = value as { description: { identifier: string } };
    found.push({
      kind,
      identifier: definition.description.identifier,
      path,
      dotted,
    });
  };
  for (const [key, value] of Object.entries(json)) {
    if (resource) {
      if (key === "minecraft:client_entity" || key === "particle_effect") {
        addDescription(key, value);
      } else if (key === "minecraft:geometry") {
        for (const geometry of value as unknown[]) {
          addDescription(key, geometry, true);
        }
      } else if (
        key === "animations" ||
        key === "animation_controllers" ||
        key === "render_controllers"
      ) {
        for (const identifier of Object.keys(value as Json)) {
          found.push({ kind: key, identifier, path, dotted: true });
        }
      }
    } else if (
      key === "minecraft:entity" ||
      key === "minecraft:item" ||
      key === "minecraft:block"
    ) {
      addDescription(key, value);
    } else if (key.startsWith("minecraft:recipe_")) {
      // Recipe variants share one identifier registry in the game.
      addDescription("recipe", value);
    }
  }
  return found;
}

describe.each(PACKS)("$folder pack layout and identifiers", (pack) => {
  const root = join(REPO_ROOT, "packs", pack.folder);
  // A definition's namespace is the one of the folder its file sits in (ADR 0178).
  const namespaceOf = (path: string) =>
    path.split("/").slice(0, -1).at(-1) ?? "";
  const collectDefinitions = () => {
    const files = jsonFileEntries(root);
    expect(files.length, `${pack.folder}: no JSON files found`).toBeGreaterThan(
      0,
    );
    return files.flatMap(({ path, json }) =>
      definitions(path, json, pack.resource).map((definition) => ({
        ...definition,
        namespace: namespaceOf(path),
      })),
    );
  };

  it("keeps content files flat under the namespace folder", () => {
    const files = packFiles(root);
    expect(files.length, `${pack.folder}: no files found`).toBeGreaterThan(0);
    const offenders = files.filter((path) => {
      if (ENGINE_FIXED_FILES.has(path) || /^texts\/[^/]+\.lang$/.test(path)) {
        return false;
      }
      const folders = path.split("/").slice(0, -1);
      return (
        folders.length < 2 ||
        !pack.namespaces.includes(folders.at(-1) ?? "") ||
        folders.slice(0, -1).some((folder) => NAMESPACES.has(folder))
      );
    });
    expect(offenders).toEqual([]);
  });

  it("keeps every path within the console limit", () => {
    // The Bedrock Wiki style guide caps a path at 80 characters for consoles,
    // counting from the pack folder (ADR 0047).
    const offenders = packFiles(root)
      .map((path) => `${pack.folder}/${path}`)
      .filter((path) => path.length > MAX_PATH_LENGTH);
    expect(offenders).toEqual([]);
  });

  it("namespaces every definition identifier", () => {
    const offenders = collectDefinitions().filter(
      ({ identifier, dotted, namespace, kind, path }) => {
        // ADR 0238 preserves the vanilla identifier for this one player override.
        if (
          pack.folder === "yasu_ride_rp" &&
          path === "entity/yasu_ride/player.ce.json" &&
          kind === "minecraft:client_entity" &&
          identifier === "minecraft:player"
        )
          return false;
        if (!dotted) return !identifier.startsWith(`${namespace}:`);
        const segments = identifier.split(".");
        const namespaceIndex = identifier.startsWith("controller.") ? 2 : 1;
        return segments[namespaceIndex] !== namespace;
      },
    );
    expect(offenders).toEqual([]);
  });

  it("defines each identifier exactly once within its kind", () => {
    const byKind = new Map<string, Map<string, Definition[]>>();
    for (const definition of collectDefinitions()) {
      const identifiers = byKind.get(definition.kind) ?? new Map();
      const occurrences = identifiers.get(definition.identifier) ?? [];
      occurrences.push(definition);
      identifiers.set(definition.identifier, occurrences);
      byKind.set(definition.kind, identifiers);
    }
    const offenders = [...byKind.values()].flatMap((identifiers) =>
      [...identifiers.values()].filter((occurrences) => occurrences.length > 1),
    );
    expect(offenders).toEqual([]);
  });
});
