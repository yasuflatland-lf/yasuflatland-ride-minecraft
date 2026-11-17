import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/unit-test.yml", "utf8");
const job = (name: string) =>
  workflow.split(`  ${name}:\n`)[1]?.split(/\n {2}[a-z][a-z-]*:\n/)[0] ?? "";

it("checks exactly the non-render manifest ids in model-others", () => {
  const manifest = JSON.parse(readFileSync("tools/generators.json", "utf8"));
  const expected = manifest.generators
    .map((entry: { id?: string; script: string }) => entry.id ?? entry.script)
    .filter((id: string) => !id.startsWith("render_preview.py:"));
  const command = job("model-others").match(/--check --only ([^\n]+)/)?.[1];
  expect(command?.trim().split(/\s+/).sort()).toEqual(expected.sort());
  expect(job("model-others")).toContain("run: pnpm run model:check");
});

it("runs the selected scenes as an independent matrix", () => {
  const scene = job("model-scene");
  expect(scene).toContain("if: needs.model-plan.outputs.scenes != '[]'");
  expect(scene).toContain("fail-fast: false");
  expect(scene).toContain(
    `scene: \${{ fromJSON(needs.model-plan.outputs.scenes) }}`,
  );
  expect(scene).toContain(
    'run_generators.py --check --only "render_preview.py:$SCENE"',
  );
});

it("requires every job and allows skipped results only for conditional model jobs", () => {
  const check = job("check");
  const required = ["quick", "test", "tools", "coverage", "model-plan"];
  const conditional = ["model-others", "model-scene"];
  expect(check.match(/needs: \[([^\]]+)\]/)?.[1]?.split(", ")).toEqual([
    ...required,
    ...conditional,
  ]);
  const condition = check.match(/- if: (.+)/)?.[1];
  expect(condition).toBe(
    [
      ...required.map((name) => `needs.${name}.result != 'success'`),
      ...conditional.map(
        (name) =>
          `(needs.${name}.result != 'success' && needs.${name}.result != 'skipped')`,
      ),
    ].join(" || "),
  );
  expect(check).toContain("if: always()");
  expect(check).toContain("run: exit 1");
});

it("uses explicit bash so a failed diff cannot silently skip model checks", () => {
  expect(job("model-plan")).toMatch(/- id: plan\n\s+shell: bash\n/);
});
