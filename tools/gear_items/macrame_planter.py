"""Build the macrame planter model in pixels."""

from tool_loader import load_tool as _load_tool

_gear_model = _load_tool("gear_model")
_atlas = _load_tool("gear_atlas")


def build() -> _gear_model.GearModel:
    return _gear_model.GearModel(
        cubes=(
            _atlas.box(-2.5, 0, -2.5, 2.5, 3, 2.5, "terracotta"),
            _atlas.box(-2, 3, -2, 2, 5, 2, "leaf"),
            _atlas.box(0.5, 0.5, -3, 1.5, 3, -2.5, "leaf"),
            _atlas.box(-2.5, 3, -0.25, -2, 8.5, 0.25, "cream"),
            _atlas.box(2, 3, -0.25, 2.5, 8.5, 0.25, "cream"),
            _atlas.box(-0.25, 3, -2.5, 0.25, 8.5, -2, "cream"),
            _atlas.box(-0.25, 3, 2, 0.25, 8.5, 2.5, "cream"),
            _atlas.box(-2.5, 8.5, -0.25, 2.5, 9, 0.25, "cream"),
            _atlas.box(-0.25, 8.5, -2.5, 0.25, 9, 2.5, "cream"),
            _atlas.box(-0.5, 9, -0.5, 0.5, 10, 0.5, "cream"),
        ),
        texture_request=("terracotta", "leaf", "cream"),
    )
