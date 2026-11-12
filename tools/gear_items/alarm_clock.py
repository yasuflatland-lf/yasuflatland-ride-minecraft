"""Build the twin-bell alarm clock placeholder in pixels."""

from tool_loader import load_tool as _load_tool

_gear_model = _load_tool("gear_model")
_atlas = _load_tool("gear_atlas")


def build() -> _gear_model.GearModel:
    cube = _atlas.box(-2.0, 0, -1, 2.0, 5, 1, "cream")
    tile = _atlas.tile("alarm_clock", 4 * _atlas.TEXELS_PER_PX, 5 * _atlas.TEXELS_PER_PX)
    tile.pixels[:] = bytes(_atlas.PALETTE["cream"]) * (tile.width * tile.height)
    cube["uv"]["north"] = tile.uv(0, 0, tile.width, tile.height)
    return _gear_model.GearModel(cubes=(cube,), texture_request=("cream",))
