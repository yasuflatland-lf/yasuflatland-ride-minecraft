import { execFileSync } from "node:child_process";

export default function setup() {
  execFileSync("python3", ["-I", "tools/run_generators.py", "--ensure"], {
    stdio: "inherit",
  });
}
