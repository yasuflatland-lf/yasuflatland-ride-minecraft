import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";

const python = (body: string) =>
  JSON.parse(
    execFileSync(
      "python3",
      [
        "-I",
        "-c",
        [
          "import json, sys",
          "from pathlib import Path",
          "sys.path.insert(0, 'tools')",
          "import suv_reference_views as s",
          "import render_preview as r",
          body,
        ].join("\n"),
      ],
      { encoding: "utf8", timeout: 60_000 },
    ),
  );

it("defines exactly the 19 reference photos with non-zero views", () => {
  const views = python(
    "print(json.dumps({name: v.view for name, v in s.REFERENCE_VIEWS.items()}))",
  );
  expect(Object.keys(views).sort()).toEqual(
    [
      "rubicon_front.png",
      "rubicon_front_blueprint.png",
      "rubicon_front_tia.png",
      "rubicon_front_top.png",
      "rubicon_left_back_blueprint.pnt.png",
      "rubicon_left_back_top.png",
      "rubicon_left_front.png",
      "rubicon_left_front_blueprint.png",
      "rubicon_left_front_top.png",
      "rubicon_left_front_top2.png",
      "rubicon_left_side.png",
      "rubicon_left_side2.png",
      "rubicon_left_side_top_blueprint.png",
      "rubicon_right_back.png",
      "rubicon_right_back_side.png",
      "rubicon_right_back_tia.png",
      "rubicon_right_front.png",
      "rubicon_right_front_top.png",
      "rubicon_right_side_blueprint.png",
    ].sort(),
  );
  for (const vector of Object.values(views) as number[][]) {
    expect(vector).toHaveLength(3);
    expect(vector.every(Number.isFinite)).toBe(true);
    expect(Math.hypot(...vector)).toBeGreaterThan(0);
  }
});

it("renders the requested SUV size deterministically", () => {
  const result = python(`
a = r.render_suv_view(Path("packs/yasu_ride_rp"), (-1, 0.35, -1), None, (160, 120))
b = r.render_suv_view(Path("packs/yasu_ride_rp"), (-1, 0.35, -1), None, (160, 120))
print(json.dumps({"same": a.pixels == b.pixels, "size": [a.width, a.height], "length": len(a.pixels), "visible": any(a.pixels[3::4])}))
`);
  expect(result).toEqual({
    same: true,
    size: [160, 120],
    length: 160 * 120 * 4,
    visible: true,
  });
}, 60_000);

it("averages photo pixels and composites transparency on light grey", () => {
  expect(
    python(`
image = r.Image(2, 1, bytearray([255, 0, 0, 255, 0, 0, 0, 0]))
print(json.dumps(list(s.resize(image, 1, 1).pixels)))
`),
  ).toEqual([245, 118, 118, 255]);
});
