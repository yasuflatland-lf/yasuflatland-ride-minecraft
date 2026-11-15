"""Ownership and input patterns for generated assets, using POSIX fnmatch globs."""

import fnmatch
import json
from dataclasses import dataclass
from pathlib import Path

PLAN = Path(__file__).resolve().with_name("generators.json")


@dataclass(frozen=True)
class GeneratedOutput:
    generator: str
    pattern: str
    tracked: bool


class OutputManifest:
    def __init__(self, entries):
        self._outputs = tuple(
            GeneratedOutput(entry["script"], pattern, entry.get("tracked", False))
            for entry in entries for pattern in entry["outputs"]
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
