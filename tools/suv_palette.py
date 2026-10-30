"""SUV color swatches, paint variants and texture slots."""

from typing import NamedTuple


# Color swatches. Each color fills a 4x4 cell, and each face's UV points at the cell's center 2x2
PALETTE = {
    "body": (142, 128, 88),  # khaki
    "trim": (58, 58, 60),
    "grille": (14, 14, 14),
    "tire": (20, 20, 20),
    "rim": (176, 176, 180),
    "seat": (24, 24, 26),  # black leather
    "seat_pleat": (58, 58, 63),  # the lit tops of the pleats
    "light": (232, 232, 208),
    "tail": (170, 30, 30),
    "glass": (40, 52, 60),
    "gauge": (225, 225, 215),
    "amber": (235, 150, 30),
    "leather": (110, 68, 38),
    "spoke": (97, 97, 97),  # #616161
    "glow": (80, 170, 255),
    # Opaque tinted glass: in flight it hides the riders, who stay upright while the body banks (ADR 0026)
    "rear_glass": (38, 84, 160),
    "prop": (214, 170, 82),  # polished bronze
    "prop_hub": (236, 196, 110),
    "arm": (72, 76, 82),  # gunmetal
    # The hardtop (roof and the cargo area's upper panels) stays black under every paint. It is a
    # little bluer and darker than the "black" paint so the two read apart on a black body.
    "hardtop": (28, 29, 32),
    "hardtop_rib": (46, 47, 52),  # the lit tops of the roof ribs
}
NAMES = list(PALETTE)
LIT_SLOTS = tuple(NAMES.index(name) for name in ("light",))
# Swatch alpha, 255 unless listed. Alpha 0 marks the headlight lenses as emissive for the
# entity_emissive material; the materials the lenses use while the headlights are off ignore alpha
# (ADR 0020). entity_emissive_alpha makes a texel glow when its alpha is low but not 0 (ADR 0022).
ALPHA = {"light": 0, "glow": 40}


class Paint(NamedTuple):
    name: str
    body: tuple[int, int, int]


# Body color of each paint (ADR 0031). Khaki writes suv.png; the others write suv_<paint>.png.
# The red stays darker than the "tail" swatch so the tail lights still show on a red body, the orange
# stays darker than the "amber" swatch, and the black stays lighter than the "grille" so the slots show.
BODY_PAINTS = (
    Paint("khaki", PALETTE["body"]),
    Paint("green", (62, 96, 56)),
    Paint("red", (128, 22, 26)),
    Paint("white", (222, 222, 216)),
    Paint("light_gray", (156, 156, 152)),
    Paint("gray", (92, 94, 98)),
    Paint("black", (34, 34, 36)),
    Paint("orange", (190, 92, 28)),
    Paint("yellow", (214, 178, 44)),
    Paint("lime", (112, 160, 42)),
    Paint("cyan", (30, 118, 124)),
    Paint("light_blue", (92, 150, 204)),
    Paint("blue", (40, 58, 128)),
    Paint("purple", (94, 46, 128)),
    Paint("magenta", (160, 52, 140)),
    Paint("pink", (214, 132, 162)),
)
