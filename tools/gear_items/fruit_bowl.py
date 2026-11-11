"""Build the fruit bowl model in pixels."""

from tool_loader import load_tool as _load_tool

_gear_model = _load_tool("gear_model")
_atlas = _load_tool("gear_atlas")


def build() -> _gear_model.GearModel:
    return _gear_model.GearModel(
        cubes=(
            _atlas.box(-2, 0, -2, 2, 1, 2, "avocado"),
            _atlas.box(-3, 1, -3, 3, 2, 3, "avocado"),
            _atlas.box(-2, 2, -1.5, -0.5, 3, 0, "red"),
            _atlas.box(0, 2, -1, 1.5, 3, 0.5, "burnt_orange"),
            _atlas.box(-1.5, 2, 0.5, 2, 2.75, 1.5, "harvest_gold"),
        ),
        texture_request=("avocado", "red", "burnt_orange", "harvest_gold"),
    )
