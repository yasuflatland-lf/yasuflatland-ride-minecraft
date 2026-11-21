"""Select potentially stale model scenes and other generators from changed paths."""

import argparse
import fnmatch
import json
import os
import sys
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path, PurePosixPath

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
from generated_outputs import ManifestEntry, OutputManifest


@dataclass(frozen=True)
class Selection:
    scenes: tuple[str, ...]
    others: bool


def dependency_closure(affected: set[ManifestEntry],
                       entries: tuple[ManifestEntry, ...]) -> set[ManifestEntry]:
    affected = set(affected)
    pending = list(affected)
    while pending:
        upstream = pending.pop()
        for entry in entries:
            if entry not in affected and any(
                    fnmatch.fnmatchcase(output, read)
                    or fnmatch.fnmatchcase(read, output)
                    for output in upstream.outputs for read in entry.reads):
                affected.add(entry)
                pending.append(entry)
    return affected


def select(changed_paths: Iterable[str], manifest: OutputManifest) -> Selection:
    entries = manifest.entries()
    scenes = tuple(entry for entry in entries if entry.id.startswith("render_preview.py:"))
    others = tuple(entry for entry in entries if entry.script != "render_preview.py")
    selected = set()
    run_others = False
    for path in changed_paths:
        if "__pycache__" in PurePosixPath(path).parts:
            continue
        affected = set()
        if (PurePosixPath(path).parent == PurePosixPath("tools")
                and fnmatch.fnmatchcase(PurePosixPath(path).name, "gen_*.py")
                and any(entry.script == PurePosixPath(path).name for entry in entries)):
            run_others = True
            affected = {entry for entry in others
                        if entry.script == PurePosixPath(path).name}
        elif (path.startswith("tools/")
              or path in {"package.json", "mise.toml", ".github/workflows/unit-test.yml"}):
            return Selection(tuple(scene.id.split(":", 1)[1] for scene in scenes), True)
        selected.update(scene.id for scene in scenes
                        if any(fnmatch.fnmatchcase(path, pattern)
                               for pattern in (*scene.reads, *scene.outputs)))
        affected.update(entry for entry in others
                        if any(fnmatch.fnmatchcase(path, pattern)
                               for pattern in (*entry.reads,
                                               *(entry.outputs if entry.tracked else entry.tracked_outputs))))
        run_others |= bool(affected)
        outputs = tuple(output for entry in dependency_closure(affected, others)
                        for output in entry.outputs)
        selected.update(scene.id for scene in scenes
                        if any(fnmatch.fnmatchcase(output, read)
                               or fnmatch.fnmatchcase(read, output)
                               for output in outputs for read in scene.reads))
    return Selection(tuple(scene.id.split(":", 1)[1] for scene in scenes
                           if scene.id in selected), run_others)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--all", action="store_true", help="Select everything without reading stdin")
    args = parser.parse_args()
    manifest = OutputManifest.load()
    if args.all:
        result = Selection(tuple(entry.id.split(":", 1)[1] for entry in manifest.entries()
                                 if entry.id.startswith("render_preview.py:")), True)
    else:
        paths = (os.fsdecode(path) for path in sys.stdin.buffer.read().split(b"\0") if path)
        result = select(paths, manifest)
    print(json.dumps({"scenes": result.scenes, "others": result.others}))


if __name__ == "__main__":
    main()
