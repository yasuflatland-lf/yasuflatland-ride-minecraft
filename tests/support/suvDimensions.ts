import { execFileSync } from "node:child_process";

const script = [
  "import json, sys",
  "sys.path.insert(0, 'tools')",
  "from tool_loader import load_tool",
  "d = load_tool('suv_dims')",
  "print(json.dumps({k: v for k, v in vars(d).items() if k.isupper() and isinstance(v, (int, float))}))",
].join("\n");
const dimensions = JSON.parse(
  execFileSync("python3", ["-I", "-c", script], { encoding: "utf8" }),
) as Record<string, number>;

export const constant = (name: string): number => {
  const value = dimensions[name];
  if (value === undefined) throw new Error(`Missing dimension ${name}`);
  return value;
};

// Construction lengths reach the exported model scaled by SIZE_SCALE (ADR 0170).
export const dimension = (name: string): number =>
  Number((constant(name) * constant("SIZE_SCALE")).toFixed(12));
