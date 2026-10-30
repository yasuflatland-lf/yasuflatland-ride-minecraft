"""Compatibility exports for the shared swatch atlas."""

from tool_loader import load_tool

_atlas = load_tool("swatch_atlas")
Atlas = _atlas.Atlas
Region = _atlas.Region
__all__ = ["Atlas", "Region"]
