import fc from "fast-check";
import { afterAll, describe, expect, it } from "vitest";
import { startPythonWorker } from "../support/pythonWorker";

const python = startPythonWorker();
afterAll(() => python.close());

interface VariantInput {
  name: string;
  color: string;
  mer: string | null;
}

interface Result {
  colorOf: Record<string, string>;
  merOf: Record<string, string>;
  stored: string[];
  files: Record<string, string>;
  sets: Record<string, { color: string; mer: string }>;
}

// Textures are 1x1, so each content is one RGBA texel written as 8 hex digits.
const run = async (variants: VariantInput[]): Promise<Result> => {
  const script = [
    "import json, sys, tempfile",
    "from pathlib import Path",
    "sys.path.insert(0, 'tools')",
    "from tool_loader import load_tool",
    "tv = load_tool('texture_variants')",
    "io = load_tool('texture_io')",
    "png = load_tool('render_preview').read_png_bytes",
    "items = json.loads(sys.stdin.read())",
    "variants = [tv.Variant(v['name'], bytes.fromhex(v['color']),",
    "                       None if v['mer'] is None else bytes.fromhex(v['mer'])) for v in items]",
    "with tempfile.TemporaryDirectory() as directory:",
    "    d = Path(directory)",
    "    out = io.Outputs(False)",
    "    result = tv.write_variants(out, d, 'kind', 1, 1, variants)",
    "    files = {p.stem: png(p)[2].hex() for p in sorted(d.glob('*.png'))}",
    "    sets = {p.name[:-len('.texture_set.json')]: json.loads(p.read_text())['minecraft:texture_set']",
    "            for p in sorted(d.glob('*.texture_set.json'))}",
    "    print(json.dumps({'colorOf': dict(result.color_of), 'merOf': dict(result.mer_of),",
    "                      'stored': list(result.stored()), 'files': files,",
    "                      'sets': {k: {'color': v['color'], 'mer': v['metalness_emissive_roughness']}",
    "                               for k, v in sets.items()}}))",
  ].join("\n");
  return JSON.parse(await python.run(script, JSON.stringify(variants)));
};

const texel = fc
  .integer({ min: 0, max: 3 })
  .map((n) => `${n.toString(16).padStart(2, "0")}000000`);

const variantList = fc
  .array(
    fc.record({
      color: texel,
      mer: fc.option(texel, { nil: null }),
    }),
    { minLength: 1, maxLength: 8 },
  )
  .map((items) => items.map((item, index) => ({ name: `v${index}`, ...item })));

describe("texture variants writer", () => {
  it("stores each distinct content once and resolves every variant to its own bytes", async () => {
    await fc.assert(
      fc.asyncProperty(variantList, async (variants) => {
        const result = await run(variants);
        const keeperOfPair = new Map<string, string>();
        const keeperOfMer = new Map<string, string>();
        for (const variant of variants) {
          const key = `${variant.color}|${variant.mer}`;
          if (!keeperOfPair.has(key)) keeperOfPair.set(key, variant.name);
          const keeper = keeperOfPair.get(key) as string;
          expect(result.colorOf[variant.name]).toBe(keeper);
          expect(result.files[keeper]).toBe(variant.color);
          if (variant.mer === null) {
            expect(result.merOf[variant.name]).toBeUndefined();
            continue;
          }
          const mer = result.merOf[variant.name] as string;
          expect(result.files[mer]).toBe(variant.mer);
          if (!keeperOfMer.has(variant.mer)) keeperOfMer.set(variant.mer, mer);
          expect(mer).toBe(keeperOfMer.get(variant.mer));
        }
        const colors = new Set(keeperOfPair.values());
        const mers = new Set(Object.values(result.merOf));
        // A texture set exists exactly for each stored colour that has a MER,
        // and it points at that MER's stored file.
        const withMer = [...colors].filter((color) => color in result.merOf);
        expect(Object.keys(result.sets).sort()).toEqual(withMer.sort());
        for (const color of withMer) {
          expect(result.sets[color]?.color).toBe(color);
          expect(result.sets[color]?.mer).toBe(result.merOf[color]);
          expect(result.files[result.sets[color]?.mer as string]).toBeDefined();
        }
        // Every stored file is listed once and no two stored files of a role share content.
        expect(new Set(result.stored).size).toBe(result.stored.length);
        expect([...result.stored].sort()).toEqual([...colors, ...mers].sort());
        expect(Object.keys(result.files).sort()).toEqual(
          [...colors, ...mers].sort(),
        );
        const merContents = [...mers].map((name) => result.files[name]);
        expect(new Set(merContents).size).toBe(merContents.length);
      }),
      { numRuns: 40 },
    );
  });

  it("lets the first variant of equal content keep its name", async () => {
    const result = await run([
      { name: "a", color: "01000000", mer: "02000000" },
      { name: "b", color: "01000000", mer: "02000000" },
      { name: "c", color: "01000000", mer: "03000000" },
    ]);
    expect(result.colorOf).toEqual({ a: "a", b: "a", c: "c" });
    expect(Object.keys(result.sets).sort()).toEqual(["a", "c"]);
  });

  it("writes no texture set for variants without a MER", async () => {
    const result = await run([
      { name: "a", color: "01000000", mer: null },
      { name: "b", color: "02000000", mer: null },
    ]);
    expect(result.sets).toEqual({});
    expect(result.stored).toEqual(["a", "b"]);
  });

  it("stores one kind_mer file when every variant has the same MER", async () => {
    const result = await run([
      { name: "red", color: "01000000", mer: "09000000" },
      { name: "blue", color: "02000000", mer: "09000000" },
    ]);
    expect(result.merOf).toEqual({ red: "kind_mer", blue: "kind_mer" });
    expect(result.stored).toEqual(["kind_mer", "red", "blue"]);
    expect(result.sets.blue?.mer).toBe("kind_mer");
  });

  it("stores a name_mer file for the first variant of each distinct MER", async () => {
    const result = await run([
      { name: "red", color: "01000000", mer: "09000000" },
      { name: "blue", color: "02000000", mer: "0a000000" },
      { name: "green", color: "03000000", mer: "09000000" },
    ]);
    expect(result.merOf).toEqual({
      red: "red_mer",
      blue: "blue_mer",
      green: "red_mer",
    });
    expect(result.stored).toEqual([
      "red_mer",
      "red",
      "blue_mer",
      "blue",
      "green",
    ]);
  });
});
