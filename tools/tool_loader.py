"""Load generator tools in isolated Python processes."""

import importlib.util
from functools import cache
from pathlib import Path


@cache
def load_tool(name):
    path = Path(__file__).parent / f"{name}.py"
    spec = importlib.util.spec_from_file_location(name.replace("/", "."), path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def load_tool_in(subdir, name):
    return load_tool(f"{subdir}/{name}")
