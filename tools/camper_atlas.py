"""Compatibility exports for the shared swatch atlas."""

from tool_loader import load_tool

_atlas = load_tool("swatch_atlas")
Atlas = _atlas.Atlas
Region = _atlas.Region
__all__ = ["Atlas", "Region"]


class RegisteredAtlas(Atlas):
    """Retain base-local swatches while resolving geometry through the registry."""

    base_ref = None

    def face(self, target, offset=(0, 0), uv_size=None):
        face = super().face(target, offset, uv_size)
        if self.base_ref is not None:
            face["uv"] = list(self.base_ref.uv(*face["uv"]))
        return face

    def atlas_swatch_at(self, x, y):
        if self.base_ref is not None:
            ox, oy = self.base_ref._registry._layout.origin("base")
            x, y = x - ox, y - oy
        return super().swatch_at(x, y)
