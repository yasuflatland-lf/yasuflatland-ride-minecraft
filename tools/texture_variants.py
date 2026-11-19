"""Write each distinct (colour, MER) texture content once for a set of paint variants."""

import sys
from dataclasses import dataclass
from pathlib import Path
from types import MappingProxyType
from typing import Mapping, Sequence

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tool_loader import load_tool

texture_io = load_tool("texture_io")
mer = load_tool("mer")


@dataclass(frozen=True)
class UniformMer:
    value: "mer.Mer"


@dataclass(frozen=True)
class Variant:
    name: str
    color: bytes
    mer: bytes | UniformMer | None


@dataclass(frozen=True)
class VariantTextures:
    color_of: Mapping[str, str]
    mer_of: Mapping[str, str | list[int]]
    written: tuple[str, ...] = ()

    def stored(self) -> tuple[str, ...]:
        return self.written


def write_variants(outputs, directory: Path, kind: str, width: int, height: int,
                   variants: Sequence[Variant], *, relief=None,
                   retired: Sequence[str] = ()) -> VariantTextures:
    """`retired` names extra PNG stems an earlier layout wrote that no variant name derives."""
    names = [variant.name for variant in variants]
    if len(set(names)) != len(names):
        raise ValueError("Variant names must be unique")
    for variant in variants:
        for label, data in (("color", variant.color), ("mer", variant.mer)):
            if isinstance(data, bytes) and len(data) != width * height * 4:
                raise ValueError(f"{variant.name} {label} is not {width}x{height} RGBA")

    mers = {variant.mer for variant in variants if variant.mer is not None}
    single_mer = len(mers) == 1 and all(variant.mer is not None for variant in variants)

    color_of: dict[str, str] = {}
    mer_of: dict[str, str | list[int]] = {}
    color_by_pair: dict[tuple[bytes, bytes | UniformMer | None], str] = {}
    mer_by_content: dict[bytes, str] = {}
    planned: list[tuple[str, bytes]] = []
    sets: list[tuple[str, str | list[int]]] = []

    def store(name: str, data: bytes) -> None:
        planned.append((name, data))

    for variant in variants:
        if isinstance(variant.mer, bytes) and variant.mer not in mer_by_content:
            mer_name = f"{kind}_mer" if single_mer else f"{variant.name}_mer"
            mer_by_content[variant.mer] = mer_name
            store(mer_name, variant.mer)
        if isinstance(variant.mer, UniformMer):
            mer_of[variant.name] = list(variant.mer.value.rgba()[:3])
        elif variant.mer is not None:
            mer_of[variant.name] = mer_by_content[variant.mer]
        pair = (variant.color, variant.mer)
        if pair not in color_by_pair:
            color_by_pair[pair] = variant.name
            store(variant.name, variant.color)
            # A kind without a MER ships no texture set: its default MER name would dangle.
            if variant.name in mer_of:
                sets.append((variant.name, mer_of[variant.name]))
        color_of[variant.name] = color_by_pair[pair]

    # A derived MER name (`<name>_mer` or `<kind>_mer`) can equal another variant's name;
    # writing both would overwrite one PNG and hand a variant the wrong bytes.
    written = [name for name, _ in planned]
    if len(set(written)) != len(written):
        repeated = sorted({name for name in written if written.count(name) > 1})
        raise ValueError(f"Stored texture names collide: {', '.join(repeated)}")
    for name, data in planned:
        outputs.rgba(directory / f"{name}.png", width, height, data)
    for stored, mer_name in sets:
        texture_io.write_texture_set(outputs, directory, stored, mer_name, relief)

    # Generated textures are gitignored, so files from the one-file-per-variant layout
    # survive regeneration unless removed here, and pnpm package zips the whole pack.
    kept = {f"{name}.png" for name in written} | {f"{name}.texture_set.json" for name, _ in sets}
    leftovers = {f"{kind}_mer.png", *(f"{stem}.png" for stem in retired)}
    for variant in variants:
        leftovers |= {f"{variant.name}.png", f"{variant.name}_mer.png",
                      f"{variant.name}.texture_set.json"}
    for name in sorted(leftovers - kept):
        outputs.remove(directory / name)
    return VariantTextures(MappingProxyType(color_of), MappingProxyType(mer_of), tuple(written))
