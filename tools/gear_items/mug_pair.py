"""Build the mug pair model in pixels."""

from tool_loader import load_tool as _load_tool

_gear_model = _load_tool("gear_model")
_atlas = _load_tool("gear_atlas")


def build() -> _gear_model.GearModel:
    return _gear_model.GearModel(
        cubes=(
            _atlas.box(-2, 0, -1.5, -0.5, 3, 0, "harvest_gold"),
            _atlas.box(-1.5, 1, -2, -1, 2, -1.5, "harvest_gold"),
            _atlas.box(0.5, 0, 0, 2, 3, 1.5, "burnt_orange"),
            _atlas.box(1, 1, 1.5, 1.5, 2, 2, "burnt_orange"),
        ),
        texture_request=("harvest_gold", "burnt_orange"),
    )
