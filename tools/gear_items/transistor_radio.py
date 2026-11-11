"""Build the transistor radio model in pixels."""

from tool_loader import load_tool as _load_tool

_gear_model = _load_tool("gear_model")
_atlas = _load_tool("gear_atlas")


def build() -> _gear_model.GearModel:
    return _gear_model.GearModel(
        cubes=(
            _atlas.box(-3, 0, -1, 3, 3.5, 1, "burnt_orange"),
            _atlas.box(-2.5, 0.5, -1.25, 0.5, 3, -1, "cream"),
            _atlas.box(1, 1, -1.25, 2.5, 2.5, -1, "chrome"),
            _atlas.box(-2, 3.5, -0.25, 2, 4, 0.25, "black"),
        ),
        texture_request=("burnt_orange", "cream", "chrome", "black"),
    )
