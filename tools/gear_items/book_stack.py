"""Build the book stack model in pixels."""

from tool_loader import load_tool as _load_tool

_gear_model = _load_tool("gear_model")
_atlas = _load_tool("gear_atlas")


def build() -> _gear_model.GearModel:
    return _gear_model.GearModel(
        cubes=(
            _atlas.box(-3, 0, -2, 3, 1, 2, "avocado"),
            _atlas.box(-2.5, 1, -1.75, 2.5, 2, 1.75, "burnt_orange"),
            _atlas.box(-2.75, 2, -1.5, 2.25, 3, 1.5, "harvest_gold"),
        ),
        texture_request=("avocado", "burnt_orange", "harvest_gold"),
    )
