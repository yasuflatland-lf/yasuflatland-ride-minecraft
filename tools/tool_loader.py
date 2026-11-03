"""Load sibling generator tools in isolated Python processes."""

import importlib.util
import sys
from functools import cache
from pathlib import Path


@cache
def load_tool(name):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(f"{name}.py"))
    module = importlib.util.module_from_spec(spec)
    # A dataclass with a string annotation looks its module up in sys.modules while it is built;
    # Python 3.12 (CI) raises AttributeError when the loaded tool is missing from it.
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module
