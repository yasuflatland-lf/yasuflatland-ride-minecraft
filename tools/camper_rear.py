"""Build the camper rear area."""

from tool_loader import load_tool

kit = load_tool("camper_kit")
AreaCubes = kit.AreaCubes
BAND_Y = kit.BAND_Y
BOTTOM = kit.BOTTOM
HW = kit.HW
REAR = kit.REAR
REAR_INNER = kit.REAR_INNER
REAR_OUT = kit.REAR_OUT
ROOF = kit.ROOF
STEPS_16 = kit.STEPS_16
STRIPE_Y = kit.STRIPE_Y
box = kit.box
disc = kit.disc
rear_z = kit.rear_z
rib_sides = kit.rib_sides
shift_in_slices = kit.shift_in_slices

AREA = "rear"


def build() -> AreaCubes:
    body = []
    # --- Rear -------------------------------------------------------------------
    # Static amber turn signals outside the tail lights, clear of the ladder (ADR 0145).
    REAR_SIGNAL_X, REAR_SIGNAL_Y = 22.9, 15.0
    REAR_SIGNAL_BEZEL_R, REAR_SIGNAL_LENS_R = 0.9, 0.65
    REAR_START = len(body)
    REAR_WIN = (-17, 17, 38, 50)
    body.append(box(-17, 38, REAR - 0.6, 17, 50, REAR - 0.4, "glass"))
    body.append(box(-0.3, 38, REAR - 0.4, 0.3, 50, REAR + 0.1, "chrome"))
    for fy0, fy1 in ((37.4, 38), (50, 50.6)):
        body.append(box(-17.6, fy0, REAR, 17.6, fy1, REAR + 0.2, "black"))
    for fx in (-17.6, 17):
        body.append(box(fx, 38, REAR, fx + 0.6, 50, REAR + 0.2, "black"))
    for x in (-12, -4, 4, 12):
        body += disc("z", x, ROOF - 2.2, REAR + 0.2, 0.7, 0.3, "marker_red", steps=(0, 45))
    # Two-door hatch with a tan center bar, a tan band along the bottom, round tail lights.
    for x0, x1 in ((-13, -0.6), (0.6, 13)):
        body.append(box(x0, 12, REAR, x1, 26, REAR + 0.2, "white"))
        for fy0, fy1 in ((11.6, 12), (26, 26.4)):
            body.append(box(x0 - 0.4, fy0, REAR, x1 + 0.4, fy1, REAR + 0.3, "slat"))
        for fx in (x0 - 0.4, x1):
            body.append(box(fx, 12, REAR, fx + 0.4, 26, REAR + 0.3, "slat"))
    body.append(box(-0.6, 10, REAR, 0.6, 27, REAR + 0.35, "tan"))
    body.append(box(-15, 10, REAR, 15, 11, REAR + 0.35, "tan"))
    body.append(box(-HW, BOTTOM, REAR, HW, 10, REAR + 0.15, "tan"))
    for sx in (1, -1):
        body += disc("z", sx * 19, 15, REAR + 0.2, 1.6, 0.4, "marker_red")
        body += disc("z", sx * REAR_SIGNAL_X, REAR_SIGNAL_Y, REAR + 0.2, REAR_SIGNAL_BEZEL_R, 0.4, "chrome", steps=STEPS_16)
        body += disc("z", sx * REAR_SIGNAL_X, REAR_SIGNAL_Y, REAR + 0.5, REAR_SIGNAL_LENS_R, 0.3, "amber", steps=STEPS_16)
    body.append(box(-19, 17.5, REAR, -16, 21, REAR + 0.3, "panel"))  # backup light box
    body.append(box(-20, 10.5, REAR, -15, 13.5, REAR + 0.3, "white"))  # plate
    body.append(box(-HW - 0.5, 3, REAR - 1, HW + 0.5, 7.5, REAR + 2.5, "steel"))  # bumper with step slots, as the front
    for x0 in (-17, -6, 5):
        body.append(box(x0, 6.5, REAR + 2.5, x0 + 10, 7.6, REAR + 2.6, "grille"))
    # Everything above was drawn on a flat rear at REAR; move it onto the profile, in slices.
    rear, body = body[REAR_START:], body[:REAR_START]
    for c in rear:
        y0, sy = c["origin"][1], c["size"][1]
        rot = c.get("rotation")
        cuts = [y0]
        if sy > 0.75 and not rot and y0 + sy > BOTTOM:
            while cuts[-1] + 0.5 < y0 + sy - 1e-6:
                cuts.append(cuts[-1] + 0.5)
        cuts.append(y0 + sy)
        body += shift_in_slices(c, cuts, lambda y: rear_z(y) - REAR)
    # The rear wall itself in half-pixel rows from the inner face out to the profile, with
    # the side colors carried around the corner strips.
    y = BOTTOM
    while y < ROOF - 1e-6:
        yc = y + 0.25
        z1 = rear_z(yc)
        side = ("tan" if yc < 15 else "stripe" if STRIPE_Y[0] <= yc < STRIPE_Y[1]
                else "khaki" if BAND_Y[0] <= yc < BAND_Y[1] else "white")
        for sx in (1, -1):
            x0, x1 = sorted((sx * HW, sx * (HW - 1)))
            body += rib_sides([box(x0, y, min(REAR_INNER, z1 - 1), x1, y + 0.5, z1, side)])
        if REAR_WIN[2] <= yc < REAR_WIN[3]:
            spans = [(-HW + 1, REAR_WIN[0]), (REAR_WIN[1], HW - 1)]
        else:
            spans = [(-HW + 1, HW - 1)]
        for x0, x1 in spans:
            body.append(box(x0, y, z1 - 1, x1, y + 0.5, z1, "white"))
        y += 0.5
    # Ladder on the right of the rear, from the bumper over the roof edge to the rack.
    LADDER = (13, 21)
    for x in LADDER:
        body.append(box(x, 7.5, REAR_OUT + 0.7, x + 0.8, ROOF + 4, REAR_OUT + 1.5, "chrome"))
        body.append(box(x, ROOF + 3.2, REAR - 4, x + 0.8, ROOF + 4, REAR_OUT + 1.5, "chrome"))  # hoop over the edge
        for y in (12, 30, ROOF - 2):
            body.append(box(x, y, rear_z(y + 0.4) - 0.2, x + 0.8, y + 0.8, REAR_OUT + 0.7, "chrome"))  # standoffs
    for y in range(10, ROOF + 4, 4):
        body.append(box(LADDER[0], y, REAR_OUT + 0.8, LADDER[1] + 0.8, y + 0.7, REAR_OUT + 1.4, "chrome"))


    return AreaCubes({'body': body})
