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

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "ensure-generated-"));
  roots.push(root);
  cpSync("tools", join(root, "tools"), {
    recursive: true,
    filter: (path) => !path.includes("__pycache__"),
  });
  mkdirSync(join(root, "packs"));
  writeFileSync(join(root, "source.txt"), "first input");
  writeFileSync(
    join(root, "tools/fixture.py"),
    `from pathlib import Path
Path('packs/output.txt').write_text(Path('source.txt').read_text())
with Path('runs.txt').open('a') as stream:
    stream.write('run\\n')
`,
  );
  writeFileSync(
    join(root, "tools/render_preview.py"),
    "raise RuntimeError('ensure must skip previews')\n",
  );
  plan(root, [
    {
      script: "fixture.py",
      args: [],
      reads: ["source.txt"],
      outputs: ["packs/*.txt"],
    },
    {
      script: "render_preview.py",
      args: [],
      reads: ["packs/output.txt"],
      outputs: ["preview.png"],
      after: ["fixture.py"],
      afterGenerators: true,
      tracked: true,
    },
  ]);
  return root;
}

function plan(root: string, generators: object[]) {
  writeFileSync(
    join(root, "tools/generators.json"),
    JSON.stringify({ generators }),
  );
}

function run(root: string, flag = "--ensure") {
  return spawnSync("python3", ["-I", "tools/run_generators.py", flag], {
    cwd: root,
    encoding: "utf8",
    timeout: 30_000,
  });
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true });
});

it("skips unchanged inputs and regenerates changed inputs and missing outputs", () => {
  const root = fixture();
  expect(run(root).status).toBe(0);
  const first = readFileSync(join(root, stamp), "utf8");
  expect(JSON.parse(first).outputs).toEqual(["packs/output.txt"]);
  expect(run(root).stdout).toContain("up to date");
  expect(readFileSync(join(root, "runs.txt"), "utf8")).toBe("run\n");
  expect(readFileSync(join(root, stamp), "utf8")).toBe(first);

  for (const input of ["source.txt", "tools/fixture.py"]) {
    writeFileSync(join(root, input), `${readFileSync(join(root, input))}\n`);
    expect(JSON.parse(run(root, "--status").stdout).fresh).toBe(false);
    expect(run(root).status).toBe(0);
    expect(JSON.parse(run(root, "--status").stdout).fresh).toBe(true);
  }
  rmSync(join(root, "packs/output.txt"));
  expect(JSON.parse(run(root, "--status").stdout).missing).toContain(
    "packs/output.txt",
  );
  expect(run(root).status).toBe(0);
  expect(readFileSync(join(root, "runs.txt"), "utf8")).toBe(
    "run\nrun\nrun\nrun\n",
  );
});

it("fingerprints paths and contents while ignoring Python bytecode caches", () => {
  const root = fixture();
  expect(run(root).status).toBe(0);
  mkdirSync(join(root, "tools/__pycache__"), { recursive: true });
  writeFileSync(join(root, "tools/__pycache__/fixture.pyc"), "cache");
  expect(run(root).stdout).toContain("up to date");
  writeFileSync(join(root, "tools/new-input.txt"), "new input");
  expect(run(root).status).toBe(0);
  rmSync(join(root, "tools/new-input.txt"));
  expect(JSON.parse(run(root, "--status").stdout).fresh).toBe(false);
  expect(run(root).status).toBe(0);
  writeFileSync(join(root, stamp), "invalid JSON");
  expect(run(root).status).toBe(0);
});

it("preserves the failing generator's name and exit code and leaves no stamp", () => {
  const root = fixture();
  expect(run(root).status).toBe(0);
  writeFileSync(join(root, "tools/fixture.py"), "raise SystemExit(17)\n");
  const result = run(root);
  expect(result.status).toBe(17);
  expect(result.stderr).toContain(
    "Generator fixture.py failed with exit code 17",
  );
  expect(existsSync(join(root, stamp))).toBe(false);
});

it("reports missing committed pack icons for packaging without rendering them", () => {
  const root = fixture();
  const path = join(root, "tools/generators.json");
  const document = JSON.parse(readFileSync(path, "utf8"));
  document.generators[1].outputs.push("packs/rendered.png");
  writeFileSync(path, JSON.stringify(document));
  expect(run(root).status).toBe(0);
  const status = JSON.parse(run(root, "--status").stdout);
  expect(status.fresh).toBe(true);
  expect(status.missing).toContain("packs/rendered.png");
  expect(run(root).stdout).toContain("up to date");
});

it("runs independent generators concurrently and waits for declared dependencies", () => {
  const root = fixture();
  for (const [name, other] of [
    ["first", "second"],
    ["second", "first"],
  ]) {
    writeFileSync(
      join(root, `tools/${name}.py`),
      `import time
from pathlib import Path
Path('${name}.started').touch()
deadline = time.monotonic() + 5
while not Path('${other}.started').exists():
    assert time.monotonic() < deadline, 'independent generators ran serially'
    time.sleep(0.01)
Path('packs/${name}.txt').write_text('done')
`,
    );
  }
  writeFileSync(
    join(root, "tools/consumer.py"),
    `from pathlib import Path
assert Path('packs/first.txt').read_text() == 'done'
assert Path('packs/second.txt').read_text() == 'done'
Path('packs/consumer.txt').write_text('done')
`,
  );
  plan(
    root,
    ["consumer", "first", "second"].map((name) => ({
      script: `${name}.py`,
      args: [],
      reads: [],
      outputs: [`packs/${name}.txt`],
      after: name === "consumer" ? ["first.py", "second.py"] : [],
    })),
  );
  expect(run(root).status).toBe(0);
  expect(JSON.parse(readFileSync(join(root, stamp), "utf8")).outputs).toEqual([
    "packs/consumer.txt",
    "packs/first.txt",
    "packs/second.txt",
  ]);
});

it.each([[["absent.py"]], [["fixture.py"]]])(
  "rejects invalid ordering dependencies %j without writing a stamp",
  (after) => {
    const root = fixture();
    plan(root, [
      {
        script: "fixture.py",
        args: [],
        reads: [],
        outputs: ["packs/output.txt"],
        after,
      },
    ]);
    expect(run(root).status).not.toBe(0);
    expect(existsSync(join(root, stamp))).toBe(false);
  },
);
