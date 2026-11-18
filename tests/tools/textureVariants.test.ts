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
  stale: string[];
}

interface RunOptions {
  // File names written into the directory before the writer runs, as a checkout
  // generated under an earlier layout would hold them.
  seed?: string[];
  check?: boolean;
  retired?: string[];
}

// Textures are 1x1, so each content is one RGBA texel written as 8 hex digits.
const run = async (
  variants: VariantInput[],
  { seed = [], check = false, retired = [] }: RunOptions = {},
): Promise<Result> => {
  const script = [
    "import json, sys, tempfile",
    "from pathlib import Path",
    "sys.path.insert(0, 'tools')",
    "from tool_loader import load_tool",
    "tv = load_tool('texture_variants')",
    "io = load_tool('texture_io')",
    "png = load_tool('render_preview').read_png_bytes",
    "request = json.loads(sys.stdin.read())",
    "items = request['variants']",
    "variants = [tv.Variant(v['name'], bytes.fromhex(v['color']),",
    "                       None if v['mer'] is None else bytes.fromhex(v['mer'])) for v in items]",
    "with tempfile.TemporaryDirectory() as directory:",
    "    d = Path(directory)",
    "    seeder = io.Outputs(False)",
    "    for name in request['seed']:",
    "        if name.endswith('.png'):",
    "            seeder.rgba(d / name, 1, 1, bytes(4))",
    "        else:",
    "            seeder.json(d / name, io.texture_set_doc('old', 'old_mer'))",
    "    out = io.Outputs(request['check'])",
    "    result = tv.write_variants(out, d, 'kind', 1, 1, variants, retired=request['retired'])",
    "    files = {p.stem: png(p)[2].hex() for p in sorted(d.glob('*.png'))}",
    "    sets = {p.name[:-len('.texture_set.json')]: json.loads(p.read_text())['minecraft:texture_set']",
    "            for p in sorted(d.glob('*.texture_set.json'))}",
    "    print(json.dumps({'colorOf': dict(result.color_of), 'merOf': dict(result.mer_of),",
    "                      'stored': list(result.stored()), 'files': files,",
    "                      'sets': {k: {'color': v['color'], 'mer': v['metalness_emissive_roughness']}",
    "                               for k, v in sets.items()},",
    "                      'stale': [entry.replace(str(d) + '/', '') for entry in out.stale]}))",
  ].join("\n");
  return JSON.parse(
    await python.run(
      script,
      JSON.stringify({ variants, seed, check, retired }),
    ),
  );
};

const texel = fc
  .integer({ min: 0, max: 3 })
  .map((n) => `${n.toString(16).padStart(2, "0")}000000`);

const variantName = fc.constantFrom(
  "a",
  "b",
  "a_mer",
  "b_mer",
  "kind",
  "kind_mer",
);

const variantList = fc
  .array(
    fc.record({
      name: variantName,
      color: texel,
      mer: fc.option(texel, { nil: null }),
    }),
    { minLength: 1, maxLength: 8 },
  )
  .filter(
    (items) => new Set(items.map((item) => item.name)).size === items.length,
  );

// Mirrors the writer's naming so the property only covers lists that can be stored.
const storedNames = (variants: VariantInput[]): string[] => {
  const mers = new Set(
    variants.filter((v) => v.mer !== null).map((v) => v.mer),
  );
  const single = mers.size === 1 && variants.every((v) => v.mer !== null);
  const names: string[] = [];
  const seenMer = new Set<string>();
  const seenPair = new Set<string>();
  for (const variant of variants) {
    if (variant.mer !== null && !seenMer.has(variant.mer)) {
      seenMer.add(variant.mer);
      names.push(single ? "kind_mer" : `${variant.name}_mer`);
    }
    if (!seenPair.has(`${variant.color}|${variant.mer}`)) {
      seenPair.add(`${variant.color}|${variant.mer}`);
      names.push(variant.name);
    }
  }
  return names;
};

describe("texture variants writer", () => {
  it("stores each distinct content once and resolves every variant to its own bytes", async () => {
    await fc.assert(
      fc.asyncProperty(variantList, async (variants) => {
        const names = storedNames(variants);
        if (new Set(names).size !== names.length) {
          await expect(run(variants)).rejects.toThrow(/collide/);
          return;
        }
        // Every name the per-variant layout could have written, plus files the writer does not own.
        const seed = [
          "kind_mer.png",
          "other.png",
          "other.texture_set.json",
          ...variants.flatMap((v) => [
            `${v.name}.png`,
            `${v.name}_mer.png`,
            `${v.name}.texture_set.json`,
          ]),
        ];
        const result = await run(variants, { seed });
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
        expect(Object.keys(result.sets).sort()).toEqual(
          [...withMer, "other"].sort(),
        );
        for (const color of withMer) {
          expect(result.sets[color]?.color).toBe(color);
          expect(result.sets[color]?.mer).toBe(result.merOf[color]);
          expect(result.files[result.sets[color]?.mer as string]).toBeDefined();
        }
        // Every stored file is listed once and no two stored files of a role share content.
        expect(new Set(result.stored).size).toBe(result.stored.length);
        expect([...result.stored].sort()).toEqual([...colors, ...mers].sort());
        expect(Object.keys(result.files).sort()).toEqual(
          [...colors, ...mers, "other"].sort(),
        );
        const merContents = [...mers].map((name) => result.files[name]);
        expect(new Set(merContents).size).toBe(merContents.length);
      }),
      { numRuns: 40 },
    );
  });

  it("rejects a derived MER name that equals another variant name", async () => {
    await expect(
      run([
        { name: "a", color: "01000000", mer: "09000000" },
        { name: "a_mer", color: "02000000", mer: "0a000000" },
      ]),
    ).rejects.toThrow(/collide/);
    await expect(
      run([
        { name: "kind_mer", color: "01000000", mer: "09000000" },
        { name: "b", color: "02000000", mer: "09000000" },
      ]),
    ).rejects.toThrow(/collide/);
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

  it("removes files of the per-variant layout and retired names it no longer stores", async () => {
    const result = await run(
      [
        { name: "a", color: "01000000", mer: "09000000" },
        { name: "b", color: "01000000", mer: "09000000" },
      ],
      {
        seed: [
          "b.png",
          "a_mer.png",
          "b_mer.png",
          "b.texture_set.json",
          "old_mer.png",
        ],
        retired: ["old_mer"],
      },
    );
    expect(Object.keys(result.files).sort()).toEqual(["a", "kind_mer"]);
    expect(Object.keys(result.sets)).toEqual(["a"]);
    expect(result.stale).toEqual([]);
  });

  it("reports leftover files as stale under check and keeps them", async () => {
    const result = await run(
      [
        { name: "a", color: "00000000", mer: null },
        { name: "b", color: "00000000", mer: null },
      ],
      { seed: ["a.png", "b.png"], check: true },
    );
    expect(result.stale).toEqual(["b.png (no longer generated)"]);
    expect(Object.keys(result.files)).toEqual(["a", "b"]);
  });
});
