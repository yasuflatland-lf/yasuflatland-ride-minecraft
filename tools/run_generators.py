"""Run every generator listed in tools/generators.json (`pnpm model`, `pnpm model:check`).

    python3 -I tools/run_generators.py           write the generated files
    python3 -I tools/run_generators.py --check   fail if any generated file is stale

tools/generators.json lists the generator scripts in run order, each with its arguments, and the
paths Biome formats after they have written (`format`). A generator marked `afterFormat` reads the
formatted files, so it runs after Biome. --check appends `--check` to every generator and skips
Biome, because the generators compare parsed JSON. A new generator needs only an entry there.
"""

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
PLAN = TOOLS / "generators.json"
ROOT = TOOLS.parent


def run(command):
    print("$", " ".join(Path(part).name if part.startswith(str(TOOLS)) else part for part in command), flush=True)
    result = subprocess.run(command, cwd=ROOT)
    if result.returncode != 0:
        sys.exit(result.returncode)


def generator_command(entry, check):
    command = [sys.executable, "-I", str(TOOLS / entry["script"]), *entry["args"]]
    return command + ["--check"] if check else command


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--check", action="store_true", help="fail if any generated file is stale")
    args = parser.parse_args()

    plan = json.loads(PLAN.read_text())
    generators = plan["generators"]
    before = [g for g in generators if not g.get("afterFormat")]
    after = [g for g in generators if g.get("afterFormat")]

    for entry in before:
        run(generator_command(entry, args.check))
    if not args.check:
        biome = shutil.which("biome")
        if biome is None:
            sys.exit("biome is not on PATH; run this through pnpm so node_modules/.bin is included")
        run([biome, "format", "--write", *plan["format"]])
    for entry in after:
        run(generator_command(entry, args.check))


if __name__ == "__main__":
    main()
