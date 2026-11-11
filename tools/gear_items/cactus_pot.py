"""Build the cactus pot model in pixels."""

from tool_loader import load_tool as _load_tool

_gear_model = _load_tool("gear_model")
_atlas = _load_tool("gear_atlas")


def build() -> _gear_model.GearModel:
    return _gear_model.GearModel(
        cubes=(
            _atlas.box(-2, 0, -2, 2, 3, 2, "harvest_gold"),
            _atlas.box(-1, 3, -1, 1, 7, 1, "leaf"),
            _atlas.box(1, 4, -0.5, 2, 6, 0.5, "leaf"),
        ),
        texture_request=("harvest_gold", "leaf"),
    )
