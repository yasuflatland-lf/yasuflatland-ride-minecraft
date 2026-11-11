"""Build the cushion model in pixels."""

from tool_loader import load_tool as _load_tool

_gear_model = _load_tool("gear_model")
_atlas = _load_tool("gear_atlas")


def build() -> _gear_model.GearModel:
    return _gear_model.GearModel(
        cubes=(
            _atlas.box(-3.5, 0, -3, 3.5, 1, 3, "burnt_orange"),
            _atlas.box(-3.5, 1, -3, 3.5, 2, 3, "brown"),
            _atlas.box(-3.5, 2, -3, 3.5, 3, 3, "burnt_orange"),
        ),
        texture_request=("burnt_orange", "brown"),
    )
