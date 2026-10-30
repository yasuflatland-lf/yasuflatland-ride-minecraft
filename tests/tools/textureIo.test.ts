import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";

it("compares JSON and PNG content and reports every stale file", () => {
  const script = `
import json, sys, tempfile
from pathlib import Path
sys.path.insert(0, 'tools')
from tool_loader import load_tool
io = load_tool('texture_io')
with tempfile.TemporaryDirectory() as d:
 p = Path(d)
 pixel = lambda x, y: (x, y, 20, 255)
 write = io.Outputs(False)
 write.png(p / 'a.png', 32, 32, pixel, 0)
 write.png(p / 'b.png', 32, 32, pixel, 9)
 assert (p / 'a.png').read_bytes() != (p / 'b.png').read_bytes()
 (p / 'a.json').write_text('{ "b": 2, "a": 1 }')
 check = io.Outputs(True)
 check.json(p / 'a.json', {'a': 1, 'b': 2})
 check.png(p / 'a.png', 32, 32, pixel, 9)
 check.png(p / 'b.png', 32, 32, pixel, 0)
 assert not check.stale
 check.json(p / 'a.json', {})
 check.png(p / 'a.png', 1, 1, pixel)
 check.json(p / 'missing.json', {})
 try:
  check.finish('Stale:', 'ok')
 except SystemExit as e:
  print(str(e).replace(str(p), 'DIR'))
`;
  expect(
    execFileSync("python3", ["-I", "-c", script], { encoding: "utf8" }).trim(),
  ).toBe("Stale:\nDIR/a.json\nDIR/a.png\nDIR/missing.json");
});
