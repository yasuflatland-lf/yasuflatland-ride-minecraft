import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";

it("orders the SUV body heights and longitudinal landmarks consistently", () => {
  const script = [
    "import contextlib, io, json, sys, tempfile",
    "sys.path.insert(0, 'tools')",
    "from tool_loader import load_tool",
    // Loading the generator writes assets; keep them out of the repository.
    "with tempfile.TemporaryDirectory() as output:",
    "    sys.argv = ['gen_model.py', output]",
    "    with contextlib.redirect_stdout(io.StringIO()):",
    "        g = load_tool('gen_model')",
    "    print(json.dumps([[g.SILL_Y, g.FLOOR_Y, g.BELT_Y, g.WINDOW_TOP_Y, g.ROOF_Y], [g.REAR, g.CARGO_FRONT, g.WINDSHIELD_FOOT_Z]]))",
  ].join("\n");
  const dimensions = JSON.parse(
    execFileSync("python3", ["-I", "-c", script], { encoding: "utf8" }),
  ) as number[][];
  for (const ordered of dimensions) {
    for (let i = 1; i < ordered.length; i++) {
      expect(ordered[i - 1]).toBeLessThan(ordered[i] as number);
    }
  }
});
