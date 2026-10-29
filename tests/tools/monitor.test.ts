import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fc from "fast-check";
import { expect, it } from "vitest";

const setup = [
  "import json, sys, tempfile",
  "from pathlib import Path",
  "from dataclasses import replace",
  "sys.path.insert(0, 'tools')",
  "import monitor as m",
  "layout = m.MonitorLayout(cell_size=(48, 32), label_width=25, face='down', plate_origin=(-2, 0, -1), plate_pivot=(0, 0, 0), plate_rotation=(0, 0, 0), plate_size=(4, 0.02, 2), viewer_point=(0, -10, 0), uv_flip=(True, True), background=(52, 92, 112, 255), foreground=(200, 236, 248, 0), icon_at=(2, 8), label_at=(21, 12), visible_bounds_width=7, visible_bounds_height=5, visible_bounds_offset=(0, 1.5, 0))",
];
const python = (code: string[], input?: unknown) =>
  JSON.parse(
    execFileSync("python3", ["-I", "-c", [...setup, ...code].join("\n")], {
      input: JSON.stringify(input),
      encoding: "utf8",
    }),
  );

it("keeps cell UVs disjoint and inside the atlas for either UV direction", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: 128 }),
      fc.integer({ min: 1, max: 128 }),
      fc.integer({ min: 1, max: 20 }),
      fc.boolean(),
      fc.boolean(),
      (width, height, count, flipU, flipV) => {
        const cells = python(
          [
            "w, h, count, u, v = json.load(sys.stdin)",
            "layout = replace(layout, cell_size=(w, h), uv_flip=(u, v))",
            "print(json.dumps([m.monitor_uv(k, layout)['down'] for k in range(count)]))",
          ],
          [width, height, count, flipU, flipV],
        ) as { uv: [number, number]; uv_size: [number, number] }[];
        const rectangles = cells.map(({ uv, uv_size }) => ({
          left: Math.min(uv[0], uv[0] + uv_size[0]),
          right: Math.max(uv[0], uv[0] + uv_size[0]),
          top: Math.min(uv[1], uv[1] + uv_size[1]),
          bottom: Math.max(uv[1], uv[1] + uv_size[1]),
        }));
        for (const [i, rect] of rectangles.entries()) {
          expect(rect.left).toBeGreaterThanOrEqual(0);
          expect(rect.right).toBeLessThanOrEqual(width);
          expect(rect.top).toBeGreaterThanOrEqual(0);
          expect(rect.bottom).toBeLessThanOrEqual(height * count);
          expect((rect.right - rect.left) * (rect.bottom - rect.top)).toBe(
            width * height,
          );
          for (const other of rectangles.slice(i + 1)) {
            expect(
              rect.right <= other.left ||
                other.right <= rect.left ||
                rect.bottom <= other.top ||
                other.bottom <= rect.top,
            ).toBe(true);
          }
        }
      },
    ),
    { numRuns: 30 },
  );
});

it("writes one bone per screen row through the shared entry point", () => {
  const result = python([
    "rows = json.loads(Path('tools/monitor_screens.json').read_text())",
    "result = []",
    "with tempfile.TemporaryDirectory() as output:",
    "    for kind, screens in rows.items():",
    "        icons = {s['item']: [[layout.foreground]] for s in screens}",
    "        m.write_monitor(kind, layout, icons, False, Path(output))",
    "        geo = json.loads((Path(output) / f'models/entity/yasu_ride/{kind}_monitor.geo.json').read_text())",
    "        result.append(dict(kind=kind, expected=[f\"screen_{s['item']}_{s['state']}\" for s in screens], actual=[b['name'] for b in geo['minecraft:geometry'][0]['bones']]))",
    "print(json.dumps(result))",
  ]) as { kind: string; expected: string[]; actual: string[] }[];
  for (const { expected, actual } of result) expect(actual).toEqual(expected);
  const bulldozer = result.find(({ kind }) => kind === "bulldozer");
  expect(bulldozer?.actual).toHaveLength(6);
  expect(bulldozer?.actual.slice(4)).toEqual([
    "screen_road_paver_switch_off",
    "screen_road_paver_switch_on",
  ]);
});

it("checks the supplied viewer point without requiring a seat bone", () => {
  expect(
    python([
      "m.check_monitor_faces_viewer(layout)",
      "try:",
      "    m.check_monitor_faces_viewer(replace(layout, viewer_point=(0, 10, 0)))",
      "except ValueError as error:",
      "    print(json.dumps(str(error)))",
    ]),
  ).toContain("viewer");
});

it.each([
  "models/entity/yasu_ride/bulldozer_monitor.geo.json",
  "textures/entity/yasu_ride/bulldozer_monitor.png",
  "render_controllers/yasu_ride/bulldozer_monitor.rc.json",
])("fails --check for stale %s without rewriting it", (relative) => {
  const output = mkdtempSync(join(tmpdir(), "monitor-"));
  try {
    const args = ["-I", "tools/gen_bulldozer.py", output];
    execFileSync("python3", args);
    expect(spawnSync("python3", [...args, "--check"]).status).toBe(0);
    const path = join(output, relative);
    writeFileSync(path, "stale");
    const checked = spawnSync("python3", [...args, "--check"], {
      encoding: "utf8",
    });
    expect(checked.status).toBe(1);
    expect(checked.stderr).toContain(path);
    expect(readFileSync(path, "utf8")).toBe("stale");
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});
