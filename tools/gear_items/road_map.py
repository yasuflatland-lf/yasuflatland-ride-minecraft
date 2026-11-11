"""Build the road map model in pixels."""

from tool_loader import load_tool as _load_tool

_gear_model = _load_tool("gear_model")
_atlas = _load_tool("gear_atlas")


def build() -> _gear_model.GearModel:
    return _gear_model.GearModel(
        cubes=(
            _atlas.box(-3, 0, -2, 3, 0.5, 2, "paper"),
            _atlas.box(-3, 0.5, -2, 0, 1, 2, "sky"),
            _atlas.box(0.5, 0.5, -0.25, 3, 0.75, 0.25, "red"),
        ),
        texture_request=("paper", "sky", "red"),
    )
