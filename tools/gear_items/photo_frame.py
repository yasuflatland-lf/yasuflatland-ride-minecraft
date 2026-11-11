"""Build the photo frame model in pixels."""

from tool_loader import load_tool as _load_tool

_gear_model = _load_tool("gear_model")
_atlas = _load_tool("gear_atlas")


def build() -> _gear_model.GearModel:
    return _gear_model.GearModel(
        cubes=(
            _atlas.box(-2, 0, 0, 2, 5, 0.5, "dark_brown"),
            _atlas.box(-1.5, 2, -0.25, 1.5, 4.5, 0, "sky"),
            _atlas.box(-1.5, 0.5, -0.25, 1.5, 2, 0, "leaf"),
            _atlas.box(-0.5, 0, 0.5, 0.5, 3, 1.5, "dark_brown"),
        ),
        texture_request=("dark_brown", "sky", "leaf"),
    )
