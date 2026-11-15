"""Run every generator listed in tools/generators.json (`pnpm model`, `pnpm model:check`).

    python3 -I tools/run_generators.py           write the generated files
    python3 -I tools/run_generators.py --check   fail if any generated file is stale
    python3 -I tools/run_generators.py --list-outputs [--untracked]
    python3 -I tools/run_generators.py --list-inputs

tools/generators.json declares run order, arguments, output globs, and reads outside tools/.
All tools/** files are implicit inputs except __pycache__. Output patterns use POSIX fnmatch;
stars match across folders. Outputs writes compact JSON; afterGenerators entries run after
every other generator. --check compares parsed JSON and decoded pixels. --report-touched
FILE writes JSON Lines containing generator and repo-relative path for every write or check,
including secondary Outputs instances. Listing flags never run generators.
"""

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
PLAN = TOOLS / "generators.json"
ROOT = TOOLS.parent
sys.path.insert(0, str(TOOLS))
from generated_outputs import OutputManifest


def run(command, env=None):
    print("$", " ".join(Path(part).name if part.startswith(str(TOOLS)) else part for part in command), flush=True)
    result = subprocess.run(command, cwd=ROOT, env=env)
    if result.returncode != 0:
        sys.exit(result.returncode)


def generator_command(entry, check):
    command = [sys.executable, "-I", str(TOOLS / entry["script"]), *entry["args"]]
    return command + ["--check"] if check else command


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--check", action="store_true", help="fail if any generated file is stale")
    listing = parser.add_mutually_exclusive_group()
    listing.add_argument("--list-outputs", action="store_true")
    listing.add_argument("--list-inputs", action="store_true")
    parser.add_argument("--untracked", action="store_true", help="list only outputs not retained in Git")
    parser.add_argument("--report-touched", type=Path, help="write touched paths as JSON Lines")
    args = parser.parse_args()
    if args.untracked and not args.list_outputs:
        parser.error("--untracked requires --list-outputs")

    if args.list_outputs or args.list_inputs:
        manifest = OutputManifest.load()
        patterns = (manifest.inputs() if args.list_inputs else manifest.untracked_patterns()
                    if args.untracked else tuple(output.pattern for output in manifest.outputs()))
        print("\n".join(patterns))
        return

    env = os.environ.copy()
    env.pop("GENERATED_OUTPUTS_REPORT", None)
    if args.report_touched:
        report = args.report_touched.resolve()
        report.parent.mkdir(parents=True, exist_ok=True)
        report.write_text("")
        env["GENERATED_OUTPUTS_REPORT"] = str(report)

    plan = json.loads(PLAN.read_text())
    generators = plan["generators"]
    before = [g for g in generators if not g.get("afterGenerators")]
    after = [g for g in generators if g.get("afterGenerators")]

    for entry in before:
        run(generator_command(entry, args.check), env=env)
    for entry in after:
        run(generator_command(entry, args.check), env=env)


if __name__ == "__main__":
    main()
