"""Load sibling generator tools in isolated Python processes."""

import importlib.util
from functools import cache
from pathlib import Path


@cache
def load_tool(name):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(f"{name}.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module
