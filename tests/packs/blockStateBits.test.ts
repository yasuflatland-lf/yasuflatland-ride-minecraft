import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { jsonFileEntries } from "../support/packFiles";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
type State = unknown[] | { values: { min: number; max: number } };

for (const pack of ["yasu_ride_bp", "yasu_ride_test_bp"]) {
  const root = join(ROOT, "packs", pack, "blocks");
  if (!existsSync(root)) continue;
  for (const { path, json } of jsonFileEntries(root)) {
    const block = json["minecraft:block"] as {
      description: { identifier: string; states?: Record<string, State> };
    };
    it(`${pack}/${path}: ${block.description.identifier} fits Bedrock's state limits`, () => {
      let bits = 0;
      for (const [name, state] of Object.entries(
        block.description.states ?? {},
      )) {
        const count = Array.isArray(state)
          ? state.length
          : state.values.max - state.values.min + 1;
        expect(count, name).toBeLessThanOrEqual(16);
        bits += Math.max(1, Math.ceil(Math.log2(count)));
      }
      expect(bits, block.description.identifier).toBeLessThanOrEqual(16);
    });
  }
}
