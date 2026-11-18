"""Write each distinct (colour, MER) texture content once for a set of paint variants."""

import sys
from dataclasses import dataclass
from pathlib import Path
from types import MappingProxyType
from typing import Mapping, Sequence

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tool_loader import load_tool

texture_io = load_tool("texture_io")


@dataclass(frozen=True)
class Variant:
    name: str
    color: bytes
    mer: bytes | None


@dataclass(frozen=True)
class VariantTextures:
    color_of: Mapping[str, str]
    mer_of: Mapping[str, str]
    written: tuple[str, ...] = ()

    def stored(self) -> tuple[str, ...]:
        return self.written


def write_variants(outputs, directory: Path, kind: str, width: int, height: int,
                   variants: Sequence[Variant], *, relief=None) -> VariantTextures:
    names = [variant.name for variant in variants]
    if len(set(names)) != len(names):
        raise ValueError("Variant names must be unique")
    for variant in variants:
        for label, data in (("color", variant.color), ("mer", variant.mer)):
            if data is not None and len(data) != width * height * 4:
                raise ValueError(f"{variant.name} {label} is not {width}x{height} RGBA")

    mers = {variant.mer for variant in variants if variant.mer is not None}
    single_mer = len(mers) == 1 and all(variant.mer is not None for variant in variants)

    color_of: dict[str, str] = {}
    mer_of: dict[str, str] = {}
    color_by_pair: dict[tuple[bytes, bytes | None], str] = {}
    mer_by_content: dict[bytes, str] = {}
    written: list[str] = []
    sets: list[tuple[str, str]] = []

    def store(name: str, data: bytes) -> None:
        outputs.rgba(directory / f"{name}.png", width, height, data)
        written.append(name)

    for variant in variants:
        if variant.mer is not None and variant.mer not in mer_by_content:
            mer_name = f"{kind}_mer" if single_mer else f"{variant.name}_mer"
            mer_by_content[variant.mer] = mer_name
            store(mer_name, variant.mer)
        if variant.mer is not None:
            mer_of[variant.name] = mer_by_content[variant.mer]
        pair = (variant.color, variant.mer)
        if pair not in color_by_pair:
            color_by_pair[pair] = variant.name
            store(variant.name, variant.color)
            # A kind without a MER ships no texture set: its default MER name would dangle.
            if variant.name in mer_of:
                sets.append((variant.name, mer_of[variant.name]))
        color_of[variant.name] = color_by_pair[pair]

    for stored, mer_name in sets:
        texture_io.write_texture_set(outputs, directory, stored, mer_name, relief)
    return VariantTextures(MappingProxyType(color_of), MappingProxyType(mer_of), tuple(written))
