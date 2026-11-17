"""Ownership and input patterns for generated assets, using POSIX fnmatch globs."""

import fnmatch
import json
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path

PLAN = Path(__file__).resolve().with_name("generators.json")


@dataclass(frozen=True)
class TouchedOutput:
    generator: str
    path: str


def read_touched_report(path: Path) -> tuple[TouchedOutput, ...]:
    touched = []
    for number, line in enumerate(path.read_text().splitlines(), 1):
        if not line.strip():
            continue
        message = f"Invalid touched output on line {number}"
        try:
            entry = json.loads(line)
        except ValueError as error:
            raise ValueError(message) from error
        if (not isinstance(entry, dict) or set(entry) != {"generator", "path"}
                or not all(isinstance(value, str) for value in entry.values())):
            raise ValueError(message)
        touched.append(TouchedOutput(**entry))
    return tuple(touched)


@dataclass(frozen=True)
class GeneratedOutput:
    generator: str
    pattern: str
    tracked: bool


@dataclass(frozen=True)
class ManifestEntry:
    id: str
    script: str
    args: tuple[str, ...]
    outputs: tuple[str, ...]
    reads: tuple[str, ...]
    tracked: bool
    after_generators: bool


def entry_id(entry) -> str:
    """The id is the only identity of an entry; script is only what to run."""
    return entry.get("id", entry["script"])


class OutputManifest:
    def __init__(self, entries):
        ids = [entry_id(entry) for entry in entries]
        duplicates = sorted({name for name in ids if ids.count(name) > 1})
        if duplicates:
            raise ValueError(f"Duplicate generator ids: {duplicates}")
        self._entries = tuple(
            ManifestEntry(entry_id(entry), entry["script"], tuple(entry.get("args", ())),
                          tuple(entry["outputs"]), tuple(entry["reads"]),
                          entry.get("tracked", False), entry.get("afterGenerators", False))
            for entry in entries
        )
        self._generators = tuple(ids)
        self._outputs = tuple(
            GeneratedOutput(entry.id, pattern, entry.tracked)
            for entry in self._entries for pattern in entry.outputs
        )
        self._inputs = tuple(dict.fromkeys(
            ["tools/**"] + [path for entry in entries for path in entry["reads"]
                            if "__pycache__" not in Path(path).parts]
        ))

    @classmethod
    def load(cls, path=PLAN) -> "OutputManifest":
        return cls(json.loads(Path(path).read_text())["generators"])

    def outputs(self) -> tuple[GeneratedOutput, ...]:
        return self._outputs

    def entries(self) -> tuple[ManifestEntry, ...]:
        return self._entries

    def generators(self) -> tuple[str, ...]:
        return self._generators

    def ownership_errors(self, touched: Iterable[TouchedOutput],
                         generators: Iterable[str] | None = None) -> list[str]:
        expected = set(self.generators() if generators is None else generators)
        reported = set()
        errors = set()
        for entry in touched:
            reported.add(entry.generator)
            matches = [output for output in self._outputs
                       if fnmatch.fnmatchcase(entry.path, output.pattern)]
            if not matches:
                errors.add(f"{entry.path}: touched by {entry.generator} "
                           "but declared by no output pattern")
            elif len(matches) > 1:
                owners = ", ".join(f"{output.generator}:{output.pattern}" for output in matches)
                errors.add(f"{entry.path}: matched by more than one output pattern: {owners}")
            elif matches[0].generator != entry.generator:
                errors.add(f"{entry.path}: touched by {entry.generator} "
                           f"but declared by {matches[0].generator}")
        errors.update(f"{generator}: reported no outputs" for generator in expected - reported)
        errors.update(f"{generator}: reported outputs but did not run"
                      for generator in reported - expected)
        return sorted(errors)

    def matches(self, repo_path: str) -> GeneratedOutput | None:
        matches = [output for output in self._outputs
                   if fnmatch.fnmatchcase(repo_path, output.pattern)]
        if len(matches) > 1:
            raise ValueError(f"Multiple generated output patterns match {repo_path}: {matches}")
        return matches[0] if matches else None

    def inputs(self) -> tuple[str, ...]:
        """Return read patterns; consumers exclude paths containing __pycache__."""
        return self._inputs

    def untracked_patterns(self) -> tuple[str, ...]:
        return tuple(output.pattern for output in self._outputs if not output.tracked)
