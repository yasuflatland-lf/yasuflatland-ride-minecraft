import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

export interface PythonWorker {
  run(script: string, input?: string): Promise<string>;
  close(): Promise<void>;
}

type Response = { ok: true; stdout: string } | { ok: false; error: string };
type Pending = {
  resolve: (stdout: string) => void;
  reject: (error: Error) => void;
};

export function startPythonWorker(): PythonWorker {
  const child = spawn("python3", ["-I", "tests/support/python_worker.py"], {
    cwd: fileURLToPath(new URL("../../", import.meta.url)),
    stdio: ["pipe", "pipe", "inherit"],
  });
  const pending: Pending[] = [];
  let failure: Error | undefined;
  let closing = false;

  const fail = (error: Error) => {
    failure ??= error;
    for (const request of pending.splice(0)) request.reject(failure);
  };

  child.on("error", fail);
  child.stdin.on("error", fail);
  child.stdout.on("error", fail);
  child.on("exit", (code, signal) => {
    fail(new Error(`Python worker exited (code ${code}, signal ${signal})`));
  });
  const exited = new Promise<void>((resolve) => {
    child.on("close", () => resolve());
  });

  const lines = createInterface({ input: child.stdout });
  lines.on("line", (line) => {
    let response: Response;
    try {
      response = JSON.parse(line) as Response;
    } catch (error) {
      fail(new Error("Invalid Python worker response", { cause: error }));
      return;
    }
    const request = pending.shift();
    if (!request) return;
    if (response.ok) request.resolve(response.stdout);
    else request.reject(new Error(response.error));
  });

  return {
    run(script, input = "") {
      if (failure) return Promise.reject(failure);
      if (closing) return Promise.reject(new Error("Python worker is closing"));
      return new Promise<string>((resolve, reject) => {
        pending.push({ resolve, reject });
        child.stdin.write(`${JSON.stringify({ script, input })}\n`);
      });
    },
    close() {
      if (!closing) {
        closing = true;
        child.stdin.end();
      }
      return exited;
    },
  };
}
