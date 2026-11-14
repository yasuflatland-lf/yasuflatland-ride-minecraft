"""Closed drawer boxes and routed overhead fronts (ADR 0009, 0114)."""

import random
from functools import cache
from typing import TYPE_CHECKING
from tool_loader import load_tool

if TYPE_CHECKING:
    from camper_kit import AreaCubes
    from camper_kitchen import KitchenRegions

regions = load_tool("camper_regions")
kitchen = load_tool("camper_kitchen")
RegionRegistry = regions.RegionRegistry
AREA = "kitchen_fronts"
DRAWER_HEIGHTS = {"drawer_bottom": 17.25, "drawer_top": 22.65}
DRAWER_PIVOTS = {name: [9, y, 16.45] for name, y in DRAWER_HEIGHTS.items()}
CAVITY = (8.9, 17.2, 9.5, 19.2, 27.9, 23.4)
PANEL_WIDTH, PANEL_HEIGHT = 224, 160
ROUTES = ((5, (109, 77, 43), 5), (9, (230, 219, 181), 2),
          (16, (103, 72, 40), 2), (18, (185, 171, 131), 1))
CABINET_SINK_HINGE = [9.5, 0, 9]
CABINET_STOVE_HINGE = [9.5, 0, 39]


@cache
def panel_pixels() -> tuple:
    pixels = list(kitchen.texture_pixels()["panel"])
    def inside(x, y, inset, radius):
        right, bottom = PANEL_WIDTH - inset - 1, PANEL_HEIGHT - inset - 1
        if not (inset <= x <= right and inset <= y <= bottom):
            return False
        dx = max(inset + radius - x, 0, x - right + radius)
        dy = max(inset + radius - y, 0, y - bottom + radius)
        # The integer ellipse excludes the diagonal boundary texel at radius eight.
        return dx * dx + dy * dy < radius * (radius + 1)
    for inset, color, stroke in ROUTES:
        for y in range(PANEL_HEIGHT):
            for x in range(PANEL_WIDTH):
                if inside(x, y, inset, 8) and not inside(x, y, inset + stroke, 8 - stroke):
                    pixels[y * PANEL_WIDTH + x] = (*color, 255)
    # Replay the shared texture sequence to retain the reference's worn edge marks.
    rng = random.Random(kitchen.TEXTURE_SEED)
    for kind, width, height in kitchen.TEXTURE_SEQUENCE[:2]:
        for _ in range(width * height):
            rng.choice(kitchen.NOISE)
            if kind == "laminate" and rng.random() < kitchen.LAMINATE_FLECK_RATE:
                rng.randrange(*kitchen.LAMINATE_FLECK_DEPTH)
    for _ in range(45):
        x, y = rng.randrange(8, PANEL_WIDTH - 8), rng.choice((6, PANEL_HEIGHT - 7))
        for xx in range(x, x + 3):
            pixels[y * PANEL_WIDTH + xx] = (163, 143, 102, 255)
    return tuple(pixels)


def register_panel(registry: RegionRegistry) -> regions.RegionRef:
    for region in registry.regions():
        if region.name == "routed cream panel":
            return regions.RegionRef(registry, region)
    return registry.register(regions.Region("routed cream panel", PANEL_WIDTH, PANEL_HEIGHT,
        regions.Material.LACQUER, lambda x, y: panel_pixels()[y * PANEL_WIDTH + x]))


def register_regions(registry: RegionRegistry) -> regions.RegionRef:
    """Reserve the routed panel before the shared atlas is packed."""
    return register_panel(registry)


def prepare(registry: RegionRegistry) -> tuple:
    kit = load_tool("camper_kit")
    refs = kitchen.register_kitchen(registry)
    panel = register_regions(registry)
    if not any(r.name == "base" for r in registry.regions()):
        registry.register(kit.BASE_REF.region)
    if registry is kit.REGISTRY:
        kit.prepare_layout()
    elif registry._layout is None:
        regions.pack(registry)
    return kit, refs, panel


def front(bounds: tuple, wood: regions.RegionRef, panel: regions.RegionRef,
          registry: RegionRegistry) -> dict:
    cube = kitchen.model_box(bounds, wood, registry)
    face = {"uv": list(panel.uv(0, 0)), "uv_size": [PANEL_WIDTH, PANEL_HEIGHT]}
    registry._layout.bind_face(panel.region.name, face)
    cube["uv"]["east"] = face
    return cube


def build_drawers(regions: "KitchenRegions", registry: RegionRegistry) -> "AreaCubes":
    kit, _, panel = prepare(registry)
    out = kit.AreaCubes()
    for name, y in DRAWER_HEIGHTS.items():
        cubes = [front((-9, y, 9.6, .35, 5.2, 13.7), regions.BROWN_ENDGRAIN, panel, registry)]
        bounds = [(-8.65, y + .1, z, .08, 5, .1) for z in (9.7, 23.06)]
        bounds += [(-8.64, y + 2.25, z, .25, .3, .26) for z in (15.1, 17.1)]
        bounds += [(-8.37, y + 2.15, 15.1, .15, .24, 2.26)]
        bounds += [(-19, y + .25, z, 10, 4.5, .2) for z in (10, 22.7)]
        bounds += [(-19, y + .25, 10, .2, 4.5, 12.9), (-19, y + .25, 10, 10, .2, 12.9)]
        cubes += [kitchen.model_box(b, regions.BROWN_ENDGRAIN, registry) for b in bounds]
        out[name] = kitchen.build_frame(cubes)
    return out


def build_cabinet_fronts(registry: RegionRegistry) -> "AreaCubes":
    kit, refs, panel = prepare(registry)
    wood = refs.BROWN_ENDGRAIN
    bounds = [(-22.8, 50, 8.5, 12.8, 1, 31), (-22.8, 60, 8.5, 12.8, 1, 31),
              (-22.8, 51, 8.5, .5, 9, 31)]
    bounds += [(-22.3, 51, z, 12.3, 9, .5) for z in (8.5, 23.75, 39)]
    out = kit.AreaCubes(body=kitchen.build_frame([kitchen.model_box(b, wood, registry) for b in bounds]))
    for name, z, handle in (("cabinet_sink_door", 9, 22.3), ("cabinet_stove_door", 24.4, 24.9)):
        out[name] = kitchen.build_frame([front((-10, 50.5, z, .5, 10, 14.6), wood, panel, registry),
            kitchen.model_box((-9.5, 51, handle, .3, 1.5, .7), wood, registry)])
    return out


def build() -> "AreaCubes":
    kit = load_tool("camper_kit")
    return build_drawers(kit.KITCHEN_REGIONS, kit.REGISTRY).merge(build_cabinet_fronts(kit.REGISTRY))
