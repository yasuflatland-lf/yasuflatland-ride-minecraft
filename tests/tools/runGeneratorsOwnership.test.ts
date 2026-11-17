import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";

const roots: string[] = [];
const stamp = ".cache/generated/stamp.json";
const header =
  "Generated output manifest (tools/generators.json) does not match what the generators wrote:";

function fixture(
  entries = [
    { script: "first.py", outputs: ["packs/a.json"], writes: ["packs/a.json"] },
    {
      script: "second.py",
      outputs: ["packs/b.json"],
      writes: ["packs/b.json"],
    },
  ],
) {
  const root = mkdtempSync(join(tmpdir(), "generator-ownership-"));
  roots.push(root);
  cpSync("tools", join(root, "tools"), {
    recursive: true,
    filter: (path) => !path.includes("__pycache__"),
  });
  mkdirSync(join(root, "packs"));
  writeFileSync(
    join(root, "tools/generators.json"),
    JSON.stringify({
      generators: entries.map(({ script, outputs }, index) => ({
        script,
        outputs,
        args: [],
        reads: [],
        afterGenerators: index > 0,
      })),
    }),
  );
  for (const { script, writes } of entries) {
    writeFileSync(
      join(root, `tools/${script}`),
      `import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from texture_io import Outputs
out = Outputs('--check' in sys.argv)
for path in ${JSON.stringify(writes)}:
    out.json(Path(path), {'generated': True})
out.finish('Stale fixture outputs')
`,
    );
  }
  return root;
}

function run(root: string, ...args: string[]) {
  return spawnSync("python3", ["-I", "tools/run_generators.py", ...args], {
    cwd: root,
    encoding: "utf8",
    timeout: 30_000,
  });
}

function undeclaredFixture() {
  return fixture([
    {
      script: "first.py",
      outputs: ["packs/a.json"],
      writes: ["packs/a.json", "packs/undeclared.json"],
    },
  ]);
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true });
});

it("writes a stamp for matching ownership across both phases and checks it", () => {
  const root = fixture();
  expect(run(root).status).toBe(0);
  expect(existsSync(join(root, stamp))).toBe(true);
  expect(run(root, "--check").status).toBe(0);
});

it.each([[], ["--check"]])(
  "rejects undeclared paths with arguments %j and leaves no write stamp",
  (...args) => {
    const root = undeclaredFixture();
    for (const path of ["packs/a.json", "packs/undeclared.json"]) {
      writeFileSync(join(root, path), JSON.stringify({ generated: true }));
    }
    const result = run(root, ...args);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(header);
    expect(result.stderr).toContain("packs/undeclared.json");
    expect(existsSync(join(root, stamp))).toBe(false);
  },
);

it("rejects a path written by a generator other than its declared owner", () => {
  const root = fixture([
    { script: "first.py", outputs: ["packs/a.json"], writes: ["packs/b.json"] },
    {
      script: "second.py",
      outputs: ["packs/b.json"],
      writes: ["packs/b.json"],
    },
  ]);
  const result = run(root);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain(header);
  expect(result.stderr).toContain(
    "packs/b.json: touched by first.py but declared by second.py",
  );
  expect(existsSync(join(root, stamp))).toBe(false);
});

it("rejects a planned generator that reports no outputs", () => {
  const root = fixture([{ script: "silent.py", outputs: [], writes: [] }]);
  const result = run(root);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("silent.py: reported no outputs");
  expect(existsSync(join(root, stamp))).toBe(false);
});

it("keeps ensure outside ownership verification", () => {
  const root = undeclaredFixture();
  expect(run(root, "--ensure").status).toBe(0);
  expect(existsSync(join(root, stamp))).toBe(true);
});

it.each([false, true])(
  "preserves an explicit touched report when ownership fails: %s",
  (fails) => {
    const root = fails ? undeclaredFixture() : fixture();
    const report = join(root, "reports/touched.jsonl");
    const result = run(root, "--report-touched", report);
    expect(result.status).toBe(fails ? 1 : 0);
    const touched = readFileSync(report, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(touched).toEqual(
      fails
        ? [
            { generator: "first.py", path: "packs/a.json" },
            { generator: "first.py", path: "packs/undeclared.json" },
          ]
        : [
            { generator: "first.py", path: "packs/a.json" },
            { generator: "second.py", path: "packs/b.json" },
          ],
    );
  },
);

it("owns and reports entries sharing one script by their explicit ids", () => {
  const root = fixture([
    { script: "first.py", outputs: ["packs/a.json"], writes: ["packs/a.json"] },
  ]);
  writeFileSync(
    join(root, "tools/generators.json"),
    JSON.stringify({
      generators: [
        {
          script: "first.py",
          id: "one",
          args: ["packs/a.json"],
          outputs: ["packs/a.json"],
          reads: [],
        },
        {
          script: "first.py",
          id: "two",
          args: ["packs/b.json"],
          outputs: ["packs/b.json"],
          reads: [],
          after: ["one"],
        },
      ],
    }),
  );
  writeFileSync(
    join(root, "tools/first.py"),
    `import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from texture_io import Outputs
out = Outputs('--check' in sys.argv)
out.json(Path(sys.argv[1]), {'generated': True})
out.finish('Stale fixture outputs')
`,
  );
  expect(run(root).status).toBe(0);
  expect(run(root, "--check").status).toBe(0);
  expect(existsSync(join(root, "packs/b.json"))).toBe(true);
});
