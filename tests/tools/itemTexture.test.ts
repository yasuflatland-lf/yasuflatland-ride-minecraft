import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { expect, it } from "vitest";

const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8"));

it("builds the item texture atlas from unowned base entries followed by the box and gear in spec order", () => {
  const basePath = "tools/templates/item_texture.json";
  expect(existsSync(basePath)).toBe(true);
  const base = readJson(basePath);
  const spec: { id: string }[] = readJson("tools/camping_gear.json");
  const ids = ["camping_gear_box", ...spec.map((item) => item.id)];
  const owned = ids.map((id) => `yasu_ride_${id}`);
  expect(
    Object.keys(base.texture_data).filter((key) => owned.includes(key)),
  ).toEqual([]);
  const expected = {
    ...base,
    texture_data: {
      ...base.texture_data,
      ...Object.fromEntries(
        ids.map((id) => [
          `yasu_ride_${id}`,
          { textures: `textures/items/yasu_ride/${id}` },
        ]),
      ),
    },
  };
  const generated = readJson("packs/yasu_ride_rp/textures/item_texture.json");
  expect(generated).toEqual(expected);
  expect(Object.keys(generated.texture_data)).toEqual(
    Object.keys(expected.texture_data),
  );
  const actual = JSON.parse(
    execFileSync(
      "python3",
      [
        "-I",
        "-c",
        "import json, sys; sys.path.insert(0, 'tools'); import gen_camping_gear as g; print(json.dumps(g.item_textures(json.load(open('tools/templates/item_texture.json')), json.load(open('tools/camping_gear.json')))))",
      ],
      { encoding: "utf8" },
    ),
  );
  expect(actual).toEqual(expected);
  expect(Object.keys(actual.texture_data)).toEqual(
    Object.keys(expected.texture_data),
  );
});
