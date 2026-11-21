import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { jsonFileEntries, jsonFiles } from "../support/packFiles";
import { startPythonWorker } from "../support/pythonWorker";

const root = fileURLToPath(new URL("../../", import.meta.url));
const rp = join(root, "packs/yasu_ride_rp");
const bp = join(root, "packs/yasu_ride_bp");
const fixtures = join(root, "tests/packs/fixtures/face-cull");

type Bindings = Record<string, string>;
type Arrays = Record<string, string[]>;
type Slot = "geometry" | "materials" | "textures";
type Controller = {
  geometry: string;
  textures?: string[];
  materials?: Bindings[];
  arrays?: Partial<Record<Slot, Arrays>>;
};
type Client = {
  geometry?: Bindings;
  textures?: Bindings;
  materials?: Bindings;
  render_controllers?: (string | Bindings)[];
};
type Geo = { description: { identifier: string }; bones?: { name: string }[] };
type BlockComponents = {
  "minecraft:geometry"?: string | { identifier: string };
  "minecraft:material_instances"?: Record<
    string,
    { texture: string; render_method?: string }
  >;
};
type Block = {
  components?: BlockComponents;
  permutations?: { components: BlockComponents }[];
};
type TerrainTextures = Record<string, { textures: string | string[] }>;
type RecordFile = { textures: string[]; excludedBones: string[] };

function lookup<T>(bindings: Record<string, T> | undefined, key: string) {
  return Object.entries(bindings ?? {}).find(
    ([name]) => name.toLowerCase() === key.toLowerCase(),
  )?.[1];
}

function tokens(expression: string, namespace: string): string[] {
  const pattern = new RegExp(`\\b${namespace}\\.([a-z0-9_]+)`, "gi");
  return Array.from(expression.matchAll(pattern), ([, key]) => key as string);
}

function requireBinding<T>(
  bindings: Record<string, T> | undefined,
  key: string,
  context: string,
): T {
  const binding = lookup(bindings, key);
  if (binding === undefined)
    throw new Error(`${context}: missing binding ${key}`);
  return binding;
}

function referencedTokens(
  expressions: readonly string[],
  namespace: string,
  arrays: Arrays | undefined,
): string[] {
  const pending = [...expressions];
  const visited = new Set<string>();
  const keys = new Set<string>();
  for (const expression of pending) {
    for (const key of tokens(expression, namespace))
      keys.add(key.toLowerCase());
    for (const key of tokens(expression, "Array")) {
      const id = `array.${key.toLowerCase()}`;
      if (visited.has(id)) continue;
      visited.add(id);
      pending.push(...requireBinding(arrays, id, expression));
    }
  }
  return [...keys];
}

function entityPolicy(
  identifier: string,
  clients: Client[],
  controllers: Record<string, Controller>,
) {
  const textures = new Set<string>();
  const blendPatterns = new Set<string>();
  let bound = false;
  for (const client of clients) {
    const geometryKeys = Object.entries(client.geometry ?? {})
      .filter(([, value]) => value === identifier)
      .map(([key]) => key.toLowerCase());
    if (!geometryKeys.length) continue;
    for (const entry of client.render_controllers ?? []) {
      const names = typeof entry === "string" ? [entry] : Object.keys(entry);
      for (const name of names) {
        const controller = requireBinding(controllers, name, identifier);
        const geometry = referencedTokens(
          [controller.geometry],
          "Geometry",
          controller.arrays?.geometry,
        );
        if (!geometry.some((key) => geometryKeys.includes(key))) continue;
        bound = true;
        for (const key of referencedTokens(
          [
            ...(controller.textures ?? []),
            ...Object.values(controller.arrays?.textures ?? {}).flat(),
          ],
          "Texture",
          controller.arrays?.textures,
        )) {
          textures.add(requireBinding(client.textures, key, name));
        }
        for (const entry of controller.materials ?? []) {
          for (const [pattern, expression] of Object.entries(entry)) {
            const materials = referencedTokens(
              [expression],
              "Material",
              controller.arrays?.materials,
            ).map((key) => requireBinding(client.materials, key, name));
            if (materials.some((material) => /blend/i.test(material))) {
              blendPatterns.add(pattern);
            }
          }
        }
      }
    }
  }
  return { textures, blendPatterns: [...blendPatterns], bound };
}

function blockPolicy(
  identifier: string,
  blocks: Block[],
  terrain: TerrainTextures,
) {
  const textures = new Set<string>();
  let blend = false;
  let bound = false;
  for (const block of blocks) {
    const base = block.components;
    const variants = [
      base ?? {},
      ...(block.permutations ?? []).map(({ components }) => ({
        ...base,
        ...components,
      })),
    ];
    for (const variant of variants) {
      const geometry = variant["minecraft:geometry"];
      if (
        (typeof geometry === "string" ? geometry : geometry?.identifier) !==
        identifier
      )
        continue;
      bound = true;
      for (const { texture, render_method } of Object.values(
        variant["minecraft:material_instances"] ?? {},
      )) {
        const paths = requireBinding(terrain, texture, identifier).textures;
        for (const path of [paths].flat()) textures.add(path);
        blend ||= render_method === "blend";
      }
    }
  }
  return { textures, blend, bound };
}

it("collects conditional controller textures and blend material arrays for the selected geometry", () => {
  const clients = [
    {
      geometry: { body: "geometry.test", overlay: "geometry.overlay" },
      textures: {
        fixed: "textures/fixed",
        lit: "textures/lit",
        overlay: "textures/overlay",
      },
      materials: { opaque: "entity", glass: "entity_alphablend" },
      render_controllers: [{ body: "query.enabled" }, "overlay"],
    },
  ];
  const controllers = {
    body: {
      geometry: "Geometry.body",
      textures: ["Texture.fixed"],
      materials: [{ "light_*": "Array.lamps[query.variant]" }],
      arrays: {
        textures: { "Array.variants": ["Texture.lit"] },
        materials: { "Array.lamps": ["Material.opaque", "Material.glass"] },
      },
    },
    overlay: { geometry: "Geometry.overlay", textures: ["Texture.overlay"] },
    unused: { geometry: "Geometry.body", textures: ["Texture.overlay"] },
  };
  expect(entityPolicy("geometry.test", clients, controllers)).toEqual({
    textures: new Set(["textures/fixed", "textures/lit"]),
    blendPatterns: ["light_*"],
    bound: true,
  });
});

it("detects a block's blend render method and resolves its terrain texture", () => {
  const blocks = [
    {
      components: {
        "minecraft:geometry": { identifier: "geometry.test" },
        "minecraft:material_instances": {
          "*": { texture: "test", render_method: "blend" },
        },
      },
    },
  ];
  expect(
    blockPolicy("geometry.test", blocks, {
      test: { textures: ["textures/test", "textures/variant"] },
    }),
  ).toEqual({
    textures: new Set(["textures/test", "textures/variant"]),
    blend: true,
    bound: true,
  });
});

it("matches each recorded face-culling policy to its render bindings", async () => {
  // Generators add tracked records when they adopt the pass.
  const files = existsSync(fixtures) ? jsonFileEntries(fixtures) : [];
  if (!files.length) return;

  const clients = jsonFiles(join(rp, "entity")).map(
    (file) =>
      (file["minecraft:client_entity"] as { description: Client }).description,
  );
  const controllers = Object.assign(
    {},
    ...jsonFiles(join(rp, "render_controllers")).map(
      (file) => file.render_controllers as Record<string, Controller>,
    ),
  ) as Record<string, Controller>;
  const models = jsonFiles(join(rp, "models")).flatMap(
    (file) => (file["minecraft:geometry"] as Geo[] | undefined) ?? [],
  );
  const blocks = jsonFiles(join(bp, "blocks")).map(
    (file) => file["minecraft:block"] as Block,
  );
  const terrain = JSON.parse(
    readFileSync(join(rp, "textures/terrain_texture.json"), "utf8"),
  ).texture_data as TerrainTextures;

  const exclusions = files.map(({ path, json }) => {
    const identifier = `geometry.${path.slice(0, -".json".length)}`;
    const record = json as RecordFile;
    const model = models.find(
      ({ description }) => description.identifier === identifier,
    );
    if (!model) throw new Error(`Missing geometry ${identifier}`);
    const entity = entityPolicy(identifier, clients, controllers);
    const block = blockPolicy(identifier, blocks, terrain);
    expect(entity.bound || block.bound, identifier).toBe(true);
    expect(new Set(record.textures), identifier).toEqual(
      new Set([...entity.textures, ...block.textures]),
    );
    if (block.blend) expect(record.excludedBones, identifier).toEqual(["*"]);
    return {
      identifier,
      bones: (model.bones ?? []).map(({ name }) => name),
      blendPatterns: entity.blendPatterns,
      excludedBones: record.excludedBones,
    };
  });

  const python = startPythonWorker();
  try {
    const uncovered = await python.run(
      `import json, sys
from fnmatch import fnmatchcase
missing = {}
for record in json.load(sys.stdin):
    bones = [
        bone for bone in record["bones"]
        if any(fnmatchcase(bone, pattern) for pattern in record["blendPatterns"])
        and not any(fnmatchcase(bone, pattern) for pattern in record["excludedBones"])
    ]
    if bones:
        missing[record["identifier"]] = bones
print(json.dumps(missing))
`,
      JSON.stringify(exclusions),
    );
    expect(
      JSON.parse(uncovered),
      "blend bones missing from excludedBones",
    ).toEqual({});
  } finally {
    await python.close();
  }
});
