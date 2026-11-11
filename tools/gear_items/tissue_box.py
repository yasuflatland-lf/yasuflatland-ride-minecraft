"""Build the tissue box model in pixels."""

from tool_loader import load_tool as _load_tool

_gear_model = _load_tool("gear_model")
_atlas = _load_tool("gear_atlas")


def build() -> _gear_model.GearModel:
    return _gear_model.GearModel(
        cubes=(
            _atlas.box(-2.5, 0, -1.5, 2.5, 2.5, 1.5, "harvest_gold"),
            _atlas.box(-1, 2.5, -0.5, 1, 3, 0.5, "white"),
        ),
        texture_request=("harvest_gold", "white"),
    )
