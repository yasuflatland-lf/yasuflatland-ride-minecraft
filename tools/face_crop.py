"""Detect atlas faces that sample only transparent texels."""

from tool_loader import load_tool

atlas = load_tool("region_atlas")


def is_visible(face, image: atlas.AtlasImage) -> bool:
    return not image.is_clear(atlas.UvRect.of(face).texels())
