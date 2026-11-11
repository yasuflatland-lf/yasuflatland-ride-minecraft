"""Build the desk fan model in pixels."""

from tool_loader import load_tool as _load_tool

_gear_model = _load_tool("gear_model")
_atlas = _load_tool("gear_atlas")


def build() -> _gear_model.GearModel:
    return _gear_model.GearModel(
        cubes=(
            _atlas.box(-1.5, 0, -1.5, 1.5, 0.5, 1.5, "avocado"),
            _atlas.box(-0.5, 0.5, 0, 0.5, 3, 1, "steel"),
            _atlas.box(-1, 3, 0, 1, 5, 1.5, "avocado"),
            _atlas.box(-2, 2, -0.5, 2, 6, 0, "chrome"),
            _atlas.box(-0.5, 3.5, -0.75, 0.5, 4.5, -0.5, "black"),
        ),
        texture_request=("avocado", "steel", "chrome", "black"),
    )
