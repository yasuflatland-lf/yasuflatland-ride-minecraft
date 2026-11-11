"""Build the enamel kettle model in pixels."""

from tool_loader import load_tool as _load_tool

_gear_model = _load_tool("gear_model")
_atlas = _load_tool("gear_atlas")


def build() -> _gear_model.GearModel:
    return _gear_model.GearModel(
        cubes=(
            _atlas.box(-2.5, 0, -2, 1.5, 3, 2, "avocado"),
            _atlas.box(-1.5, 3, -1.5, 0.5, 3.5, 1.5, "cream"),
            _atlas.box(1.5, 1, -0.5, 2.5, 2.5, 0.5, "avocado"),
            _atlas.box(-2, 4, -0.5, 1, 5, 0.5, "black"),
            _atlas.box(-2, 3.5, -0.5, -1.5, 4, 0.5, "black"),
            _atlas.box(0.5, 3.5, -0.5, 1, 4, 0.5, "black"),
        ),
        texture_request=("avocado", "cream", "black"),
    )
