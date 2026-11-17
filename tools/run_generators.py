"""Run generators listed in tools/generators.json (generate, model, model:check).

    python3 -I tools/run_generators.py           write the generated files
    python3 -I tools/run_generators.py --check   fail if any generated file is stale
    python3 -I tools/run_generators.py --ensure  ensure build inputs without rendering previews
    python3 -I tools/run_generators.py --status  print build-input freshness as JSON
    python3 -I tools/run_generators.py --list-outputs [--untracked]
    python3 -I tools/run_generators.py --list-inputs

tools/generators.json declares dependencies, arguments, output globs, and reads outside tools/.
All tools/** files are implicit inputs except __pycache__. Output patterns use POSIX fnmatch;
stars match across folders. Outputs writes compact JSON; afterGenerators entries run after
every other generator. --check compares parsed JSON and decoded pixels. --report-touched
FILE writes JSON Lines containing generator and repo-relative path for every write or check,
including secondary Outputs instances. Listing flags never run generators.
Full write and --check runs verify output ownership against the manifest; --ensure does not.
A generator never reads a file it or another generator writes, except render_preview.py, which
runs after the generators and reads their outputs.
"""

import argparse
import fnmatch
import hashlib
import json
import os
import subprocess
import sys
from concurrent.futures import FIRST_COMPLETED, ProcessPoolExecutor, wait
from contextlib import ExitStack
from pathlib import Path
from tempfile import TemporaryDirectory

TOOLS = Path(__file__).resolve().parent
PLAN = TOOLS / "generators.json"
ROOT = TOOLS.parent
STAMP = ROOT / ".cache/generated/stamp.json"
sys.path.insert(0, str(TOOLS))
from generated_outputs import OutputManifest, entry_id, read_touched_report


def generator_command(entry, check):
    command = [sys.executable, "-I", str(TOOLS / entry["script"]), *entry["args"]]
    return command + ["--check"] if check else command


def matching_paths(patterns):
    paths = set()
    for pattern in patterns:
        directory = ROOT
        for part in pattern.split("/"):
            if any(char in part for char in "*?["):
                break
            directory /= part
        candidates = directory.rglob("*") if directory.is_dir() else [directory]
        paths.update(path.relative_to(ROOT).as_posix() for path in candidates
                     if path.is_file() and "__pycache__" not in path.parts
                     and fnmatch.fnmatchcase(path.relative_to(ROOT).as_posix(), pattern))
    return sorted(paths)


def fingerprint(manifest):
    digest = hashlib.sha256(sys.version.encode())
    for name in matching_paths(manifest.inputs()):
        data = (ROOT / name).read_bytes()
        digest.update(name.encode() + b"\0" + str(len(data)).encode() + b"\0" + data)
    return digest.hexdigest()


def generation_status(manifest):
    try:
        stamp = json.loads(STAMP.read_text())
        if not isinstance(stamp["fingerprint"], str) or not isinstance(stamp["outputs"], list):
            raise ValueError("Invalid generation stamp")
        if not all(isinstance(path, str) for path in stamp["outputs"]):
            raise ValueError("Invalid output inventory")
    except (OSError, ValueError, KeyError, TypeError):
        stamp = None
    after_ids = {entry.id for entry in manifest.entries() if entry.after_generators}
    outputs = [output for output in manifest.outputs() if output.generator not in after_ids]
    existing = matching_paths(output.pattern for output in outputs)
    missing = {output.pattern for output in outputs
               if not any(fnmatch.fnmatchcase(path, output.pattern) for path in existing)}
    if stamp:
        missing.update(path for path in stamp["outputs"] if not (ROOT / path).is_file())
    retained = [output for output in manifest.outputs()
                if output.generator in after_ids and output.pattern.startswith("packs/")]
    retained_existing = matching_paths(output.pattern for output in retained)
    retained_missing = {output.pattern for output in retained
                        if not any(fnmatch.fnmatchcase(path, output.pattern) for path in retained_existing)}
    return {"fresh": bool(stamp and not missing and stamp["fingerprint"] == fingerprint(manifest)),
            "missing": sorted(missing | retained_missing), "missing_build": sorted(missing),
            "stamped": stamp is not None}


def run_generator(entry, check, env):
    command = generator_command(entry, check)
    print("$", " ".join(command), flush=True)
    env = {**env, "GENERATED_OUTPUTS_GENERATOR": entry_id(entry)}
    return subprocess.run(command, cwd=ROOT, env=env).returncode


def run_parallel(entries, check, env, completed=()):
    if not entries:
        return
    pending = {entry_id(entry): entry for entry in entries}
    names = set(pending)
    if len(names) != len(entries):
        sys.exit("Duplicate generator ids")
    for entry in entries:
        unknown = set(entry.get("after", [])) - names - set(completed)
        if unknown:
            sys.exit(f"{entry_id(entry)}: unknown dependencies {sorted(unknown)}")
    completed = set(completed)
    with ProcessPoolExecutor(max_workers=len(entries)) as pool:
        running = {}
        while pending or running:
            for name, entry in list(pending.items()):
                if set(entry.get("after", [])) <= completed:
                    running[pool.submit(run_generator, entry, check, env)] = name
                    del pending[name]
            if not running:
                sys.exit(f"Generator dependency cycle: {sorted(pending)}")
            done, _ = wait(running, return_when=FIRST_COMPLETED)
            for future in done:
                name = running.pop(future)
                code = future.result()
                if code:
                    for other in running:
                        other.cancel()
                    print(f"Generator {name} failed with exit code {code}", file=sys.stderr)
                    sys.exit(code if code > 0 else 128 - code)
                completed.add(name)


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--check", action="store_true", help="fail if any generated file is stale")
    mode.add_argument("--ensure", action="store_true", help="generate build inputs only when stale or missing")
    mode.add_argument("--status", action="store_true", help="print build-input freshness as JSON without generating")
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

    manifest = OutputManifest.load()
    if args.ensure or args.status:
        status = generation_status(manifest)
        if args.status:
            print(json.dumps(status))
            return
        if status["fresh"]:
            print("Generated pack files are up to date")
            return
    if not args.check:
        STAMP.unlink(missing_ok=True)

    env = os.environ.copy()
    env.pop("GENERATED_OUTPUTS_REPORT", None)
    plan = json.loads(PLAN.read_text())
    generators = [entry for entry in plan["generators"]
                  if not args.ensure or not entry.get("afterGenerators")]
    before = [g for g in generators if not g.get("afterGenerators")]
    after = [g for g in generators if g.get("afterGenerators")]

    with ExitStack() as stack:
        report = args.report_touched
        if report is None and not args.ensure:
            report = Path(stack.enter_context(TemporaryDirectory())) / "touched.jsonl"
        if report is not None:
            report = report.resolve()
            report.parent.mkdir(parents=True, exist_ok=True)
            report.write_text("")
            env["GENERATED_OUTPUTS_REPORT"] = str(report)

        run_parallel(before, args.check, env)
        run_parallel(after, args.check, env, completed=[entry_id(entry) for entry in before])

        if not args.ensure:
            errors = manifest.ownership_errors(read_touched_report(report),
                                               [entry_id(entry) for entry in generators])
            if errors:
                print("Generated output manifest (tools/generators.json) does not match "
                      "what the generators wrote:", file=sys.stderr)
                print("\n".join(errors), file=sys.stderr)
                sys.exit(1)

    if not args.check:
        status = generation_status(manifest)
        if status["missing_build"]:
            sys.exit(f"Generators left missing outputs: {status['missing_build']}")
        after_ids = {entry.id for entry in manifest.entries() if entry.after_generators}
        outputs = matching_paths(output.pattern for output in manifest.outputs()
                                 if output.generator not in after_ids)
        STAMP.parent.mkdir(parents=True, exist_ok=True)
        temporary = STAMP.with_suffix(".tmp")
        temporary.write_text(json.dumps({"fingerprint": fingerprint(manifest), "outputs": outputs}) + "\n")
        temporary.replace(STAMP)


if __name__ == "__main__":
    main()
