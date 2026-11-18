import fc from "fast-check";
import { afterAll, it } from "vitest";
import { startPythonWorker } from "../support/pythonWorker";

const python = startPythonWorker();
afterAll(() => python.close());

const setup = `
import json, sys
sys.path.insert(0, "tools")
from tool_loader import load_tool
crop = load_tool("face_crop")
atlas = load_tool("region_atlas")
`;
const alpha = fc.oneof(fc.constant(0), fc.integer({ min: 0, max: 255 }));

it("detects visibility exactly when a sampled texel has nonzero alpha", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.array(alpha, { minLength: 16, maxLength: 16 }),
      fc.integer({ min: 1, max: 4 }),
      fc.integer({ min: 1, max: 4 }),
      fc.boolean(),
      fc.boolean(),
      async (mask, width, height, flipX, flipY) => {
        await python.run(
          `${setup}
mask, w, h, flip_x, flip_y = json.loads(input())
image = atlas.AtlasImage(4, 4, bytes(c for a in mask for c in (7, 11, 13, a)))
face = {"uv": [w if flip_x else 0, h if flip_y else 0],
        "uv_size": [-w if flip_x else w, -h if flip_y else h]}
assert crop.is_visible(face, image) == any(mask[y * 4 + x] for y in range(h) for x in range(w))
`,
          JSON.stringify([mask, width, height, flipX, flipY]),
        );
      },
    ),
  );
});

it("keeps the visible texels of a cropped plate in their original model-space cells", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.array(alpha, { minLength: 9, maxLength: 9 }),
      fc.constantFrom("north", "south", "east", "west", "up", "down"),
      fc.boolean(),
      fc.boolean(),
      fc.boolean(),
      async (mask, side, pair, flipX, flipY) => {
        await python.run(
          `${setup}
mask, side, pair, flip_x, flip_y = json.loads(input())
# Evaluate both sides in the same increasing model-space coordinates.
directions = {"north": (0, 1, 1, -1), "south": (0, 1, -1, -1),
              "east": (2, 1, 1, -1), "west": (2, 1, -1, -1),
              "up": (0, 2, 1, -1), "down": (0, 2, 1, -1)}
opposite = dict(zip(directions, ("south", "north", "west", "east", "down", "up")))
faces = {}
pixels = bytearray(10 * 5 * 4)
for index, name in enumerate((side, opposite[side]) if pair else (side,)):
    _, _, u_dir, v_dir = directions[name]
    du = -1 if flip_x == (u_dir > 0) else 1
    dv = -1 if flip_y == (v_dir > 0) else 1
    faces[name] = {"uv": [index * 5 + (5 if du < 0 else 0), 5 if dv < 0 else 0],
                   "uv_size": [5 * du, 5 * dv]}
    for y in range(3):
        for x in range(3):
            u = x + 1 if du * u_dir > 0 else 3 - x
            v = y + 1 if dv * v_dir > 0 else 3 - y
            pixels[(v * 10 + index * 5 + u) * 4 + 3] = mask[y * 3 + x]
image = atlas.AtlasImage(10, 5, pixels)
cube = {"origin": [-2, 3, 7], "size": [10, 10, 10],
        "pivot": [1, 4, 5], "rotation": [38, -31, 8], "uv": faces}
result = crop.crop_plate(cube, image)
if any(mask):
    assert result is not None
    assert result["pivot"] == cube["pivot"] and result["rotation"] == cube["rotation"]

    def raster(plate, name):
        axis_u, axis_v, u_dir, v_dir = directions[name]
        uv = atlas.UvRect.of(plate["uv"][name])
        cells = {}
        for a in range(int(plate["size"][axis_u] // 2)):
            for b in range(int(plate["size"][axis_v] // 2)):
                fu = (a + 0.5) * 2 / plate["size"][axis_u]
                fv = (b + 0.5) * 2 / plate["size"][axis_v]
                x = int(uv.u + uv.w * (fu if u_dir > 0 else 1 - fu))
                y = int(uv.v + uv.h * (fv if v_dir > 0 else 1 - fv))
                value = pixels[(y * 10 + x) * 4 + 3]
                if value:
                    cells[plate["origin"][axis_u] + 2 * a, plate["origin"][axis_v] + 2 * b] = value
        return cells

    for name in faces:
        assert raster(result, name) == raster(cube, name)
else:
    assert result is None
`,
          JSON.stringify([mask, side, pair, flipX, flipY]),
        );
      },
    ),
  );
});
