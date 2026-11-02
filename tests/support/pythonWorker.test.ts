import { afterAll, describe, expect, it } from "vitest";
import { startPythonWorker } from "./pythonWorker.ts";

describe("Python worker", () => {
  const worker = startPythonWorker();
  afterAll(() => worker.close());

  it("returns the script's stdout", async () => {
    await expect(worker.run("print(1 + 1)")).resolves.toBe("2\n");
  });

  it("feeds input to stdin", async () => {
    await expect(
      worker.run(
        "import sys, json; print(json.load(sys.stdin)['a'])",
        '{"a": 7}',
      ),
    ).resolves.toBe("7\n");
  });

  it("rejects with the traceback and keeps serving", async () => {
    await expect(worker.run("raise ValueError('boom')")).rejects.toThrow(
      /ValueError: boom/,
    );
    await expect(worker.run("print('ok')")).resolves.toBe("ok\n");
  });

  it("treats sys.exit as a failure", async () => {
    await expect(worker.run("import sys; sys.exit(3)")).rejects.toThrow();
  });

  it("gives each run fresh globals and sys.path", async () => {
    await worker.run("x = 1\nimport sys; sys.path.insert(0, 'tools')");
    await expect(
      worker.run(
        "import sys; print('x' in globals(), sys.path.count('tools'))",
      ),
    ).resolves.toBe("False 0\n");
  });

  it("runs queued requests in order", async () => {
    await expect(
      Promise.all([0, 1, 2, 3].map((i) => worker.run(`print(${i})`))),
    ).resolves.toEqual(["0\n", "1\n", "2\n", "3\n"]);
  });

  it("imports a tool module", async () => {
    await expect(
      worker.run(
        "import sys; sys.path.insert(0, 'tools'); import panels; print('ok')",
      ),
    ).resolves.toBe("ok\n");
  });
});
