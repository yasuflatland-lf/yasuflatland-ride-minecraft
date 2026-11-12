"""Build the instant camera placeholder in pixels."""

from tool_loader import load_tool as _load_tool

_gear_model = _load_tool("gear_model")
_atlas = _load_tool("gear_atlas")


def build() -> _gear_model.GearModel:
    cube = _atlas.box(-2.5, 0, -1, 2.5, 7, 1, "brown")
    tile = _atlas.tile("instant_camera", 5 * _atlas.TEXELS_PER_PX, 7 * _atlas.TEXELS_PER_PX)
    tile.pixels[:] = bytes(_atlas.PALETTE["brown"]) * (tile.width * tile.height)
    cube["uv"]["north"] = tile.uv(0, 0, tile.width, tile.height)
    return _gear_model.GearModel(cubes=(cube,), texture_request=("brown",))
