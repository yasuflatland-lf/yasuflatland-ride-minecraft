import fc from "fast-check";
import { afterAll, it } from "vitest";
import { startPythonWorker } from "../support/pythonWorker";

const python = startPythonWorker();
afterAll(() => python.close());

const setup = `
import json, sys
sys.path.insert(0, "tools")
from tool_loader import load_tool
face_crop = load_tool("face_crop")
atlas = load_tool("region_atlas")
`;
const alpha = fc.oneof(fc.constant(0), fc.integer({ min: 0, max: 255 }));

it("is_visible is false exactly when every sampled alpha is 0", async () => {
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
assert face_crop.is_visible(face, image) == any(mask[y * 4 + x] for y in range(h) for x in range(w))
`,
          JSON.stringify([mask, width, height, flipX, flipY]),
        );
      },
    ),
  );
});
