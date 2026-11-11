"""Build the percolator model in pixels."""

from tool_loader import load_tool as _load_tool

_gear_model = _load_tool("gear_model")
_atlas = _load_tool("gear_atlas")


def build() -> _gear_model.GearModel:
    return _gear_model.GearModel(
        cubes=(
            _atlas.box(-2, 0, -1.5, 1, 6, 1.5, "chrome"),
            _atlas.box(-1, 6, -0.5, 0, 7, 0.5, "black"),
            _atlas.box(1, 1.5, -0.5, 2, 4.5, 0.5, "black"),
            _atlas.box(-1, 4, -2.5, 0, 5, -1.5, "chrome"),
        ),
        texture_request=("chrome", "black"),
    )
