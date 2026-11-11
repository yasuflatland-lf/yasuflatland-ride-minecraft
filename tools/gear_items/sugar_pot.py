"""Build the sugar pot model in pixels."""

from tool_loader import load_tool as _load_tool

_gear_model = _load_tool("gear_model")
_atlas = _load_tool("gear_atlas")


def build() -> _gear_model.GearModel:
    return _gear_model.GearModel(
        cubes=(
            _atlas.box(-1.5, 0, -1.5, 1.5, 3, 1.5, "glass"),
            _atlas.box(-1, 0.5, -1, 1, 2, 1, "paper"),
            _atlas.box(-1, 3, -1, 1, 3.5, 1, "chrome"),
            _atlas.box(-0.5, 3.5, -0.5, 0.5, 4, 0.5, "chrome"),
        ),
        texture_request=("glass", "paper", "chrome"),
    )
