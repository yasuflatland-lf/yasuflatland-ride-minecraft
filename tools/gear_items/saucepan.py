"""Build the saucepan model in pixels."""

from tool_loader import load_tool as _load_tool

_gear_model = _load_tool("gear_model")
_atlas = _load_tool("gear_atlas")


def build() -> _gear_model.GearModel:
    return _gear_model.GearModel(
        cubes=(
            _atlas.box(-3, 0, -2, 1, 2.5, 2, "burnt_orange"),
            _atlas.box(-2.5, 2.5, -1.5, 0.5, 3, 1.5, "chrome"),
            _atlas.box(1, 2, -0.5, 3, 2.5, 0.5, "black"),
        ),
        texture_request=("burnt_orange", "chrome", "black"),
    )
