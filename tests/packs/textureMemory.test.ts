import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { jsonFileEntries } from "../support/packFiles";
import { readRgbaPng } from "../support/png";

const ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../packs/yasu_ride_rp",
);
const MIB = 1024 * 1024;
// 142,175,904 decoded bytes, rounded up to 8 MiB (ADR 0252).
const ENTITY_TEXTURE_BUDGET_BYTES = 136 * MIB;
// The player override retains these vanilla assets; the pack does not supply them.
const VANILLA_TEXTURES = new Set([
  "textures/entity/steve",
  "textures/entity/cape_invisible",
]);
type Role = "colour" | "MER" | "heightmap" | "normal";

const merOfColour = new Map<string, string | number[]>();

function collectTextures() {
  const files = new Map<string, Set<Role>>();
  const add = (path: string, role: Role) => {
    const roles = files.get(path) ?? new Set<Role>();
    roles.add(role);
    files.set(path, roles);
  };
  const entities = jsonFileEntries(join(ROOT, "entity")).filter(({ path }) =>
    path.endsWith(".ce.json"),
  );
  expect(entities.length).toBeGreaterThan(0);
  for (const { json } of entities) {
    const entity = json["minecraft:client_entity"] as {
      description: { textures: Record<string, string> };
    };
    for (const path of Object.values(entity.description.textures)) {
      if (VANILLA_TEXTURES.has(path) && !existsSync(join(ROOT, `${path}.png`)))
        continue;
      add(`${path}.png`, "colour");
      const setPath = `${path}.texture_set.json`;
      if (!existsSync(join(ROOT, setPath))) continue;
      const textureSet = JSON.parse(readFileSync(join(ROOT, setPath), "utf8"))[
        "minecraft:texture_set"
      ] as Record<string, unknown>;
      for (const [key, role] of [
        ["metalness_emissive_roughness", "MER"],
        ["heightmap", "heightmap"],
        ["normal", "normal"],
      ] as const) {
        const companion = textureSet[key];
        if (role === "MER" && Array.isArray(companion))
          merOfColour.set(`${path}.png`, companion);
        if (typeof companion !== "string") continue;
        add(join(dirname(path), `${companion}.png`), role);
        if (role === "MER")
          merOfColour.set(
            `${path}.png`,
            join(dirname(path), `${companion}.png`),
          );
      }
    }
  }
  return [...files]
    .map(([path, roles]) => {
      const png = readFileSync(join(ROOT, path));
      return {
        path,
        roles,
        bytes: png.readUInt32BE(16) * png.readUInt32BE(20) * 4,
      };
    })
    .sort((a, b) => b.bytes - a.bytes || a.path.localeCompare(b.path));
}

function largestFiles(files: ReturnType<typeof collectTextures>) {
  return `10 largest files (decoded MiB):\n${files
    .slice(0, 10)
    .map(({ path, bytes }) => `${(bytes / MIB).toFixed(3)} MiB  ${path}`)
    .join("\n")}`;
}

describe("client entity texture memory (ADR 0252)", () => {
  it("fits the measured budget and keeps the budget within the device ceiling", () => {
    const files = collectTextures();
    const total = files.reduce((sum, file) => sum + file.bytes, 0);
    const report = `Decoded entity textures: ${total} bytes (${(total / MIB).toFixed(3)} MiB); budget: ${ENTITY_TEXTURE_BUDGET_BYTES / MIB} MiB; device ceiling: 208 MiB.\n${largestFiles(files)}`;
    expect(ENTITY_TEXTURE_BUDGET_BYTES, report).toBeLessThanOrEqual(208 * MIB);
    expect(ENTITY_TEXTURE_BUDGET_BYTES % (8 * MIB), report).toBe(0);
    expect(total, report).toBeLessThanOrEqual(ENTITY_TEXTURE_BUDGET_BYTES);
  });

  it("stores each distinct (colour, MER) content once and each MER content once", () => {
    const files = collectTextures();
    const hashOf = (path: string) =>
      createHash("sha256")
        .update(readRgbaPng(join(ROOT, path)).pixels)
        .digest("hex");
    const groups = new Map<string, string[]>();
    const group = (key: string, path: string) =>
      groups.set(key, [...(groups.get(key) ?? []), path]);
    for (const { path, roles } of files) {
      // The client resolves a texture set by its colour path, so a colour is
      // distinct when its pixels, MER pixels or uniform MER value differ (ADR 0193).
      if (roles.has("colour")) {
        const mer = merOfColour.get(path);
        const finish =
          typeof mer === "string" ? hashOf(mer) : JSON.stringify(mer ?? null);
        group(`colour+MER:${hashOf(path)}:${finish}`, path);
      }
      if (roles.has("MER")) group(`MER:${hashOf(path)}`, path);
    }
    const duplicates = [...groups]
      .filter(([, paths]) => paths.length > 1)
      .map(([key, paths]) => `${key.split(":")[0]}: ${paths.join(", ")}`);
    expect(
      duplicates,
      `Duplicate decoded texture content:\n${duplicates.join("\n")}\n${largestFiles(files)}`,
    ).toEqual([]);
  });
});
