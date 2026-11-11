"""Build the potted plant model in pixels."""

from tool_loader import load_tool as _load_tool

_gear_model = _load_tool("gear_model")
_atlas = _load_tool("gear_atlas")


def build() -> _gear_model.GearModel:
    return _gear_model.GearModel(
        cubes=(
            _atlas.box(-1.5, 0, -1.5, 1.5, 3, 1.5, "terracotta"),
            _atlas.box(-2.5, 3, -2.5, 2.5, 6, 2.5, "leaf"),
            _atlas.box(-1.5, 6, -1.5, 1.5, 8, 1.5, "avocado"),
        ),
        texture_request=("terracotta", "leaf", "avocado"),
    )
