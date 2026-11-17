"""Independent front and rear telescoping strut builders."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tool_loader import load_tool

kit = load_tool("scooter_kit")

AREA = "struts"


def _front(result):
    pass


def _rear(result):
    pass


def build():
    result = kit.AreaCubes()
    _front(result)
    _rear(result)
    return result
