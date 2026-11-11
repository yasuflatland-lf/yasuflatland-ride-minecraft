"""Build the toaster model in pixels."""

from tool_loader import load_tool as _load_tool

_gear_model = _load_tool("gear_model")
_atlas = _load_tool("gear_atlas")


def build() -> _gear_model.GearModel:
    return _gear_model.GearModel(
        cubes=(
            _atlas.box(-3, 0, -2.25, 3, 0.5, 2.25, "black"),
            _atlas.box(-2.75, 0.5, -2, 2.75, 4.5, 2, "chrome"),
            _atlas.box(-1.5, 4.5, -1, 1.5, 5, -0.5, "harvest_gold"),
            _atlas.box(-1.5, 4.5, 0.5, 1.5, 5, 1, "harvest_gold"),
            _atlas.box(2.75, 2, -0.5, 3, 3, 0.5, "steel"),
        ),
        texture_request=("black", "chrome", "harvest_gold", "steel"),
    )
