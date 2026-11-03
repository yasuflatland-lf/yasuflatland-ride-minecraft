"""SUV tires, wheels, propellers, suspension arms and hover glow."""

import math

from tool_loader import load_tool

globals().update({k: v for k, v in vars(load_tool("suv_dims")).items() if k.isupper()})
suv_cubes = load_tool("suv_cubes")
box = suv_cubes.box
disc = suv_cubes.disc


def round_tire(axis, center, radius, a0, a1, segments=16):
    """A tire whose tread is a ring of thin blocks turned around the axle, like a voxel-art wheel.

    axis is the axle direction ("x" for road wheels, "z" for the spare); a0..a1 is the tire's span along it.
    """
    step = 360 / segments
    # Half a chord, rounded up a little so neighboring tread blocks overlap instead of leaving gaps
    half_chord = round(radius * math.tan(math.radians(step / 2)) + 0.1, 3)
    tread = 1.4
    cubes = []
    for i in range(segments):
        cx, cy, cz = center
        if axis == "x":
            cube = box(a0, cy + radius - tread, cz - half_chord, a1, cy + radius, cz + half_chord, "tire")
            cube["rotation"] = [i * step, 0, 0]
        else:
            cube = box(cx - half_chord, cy + radius - tread, a0, cx + half_chord, cy + radius, a1, "tire")
            cube["rotation"] = [0, 0, i * step]
        cube["pivot"] = list(center)
        cubes.append(cube)
    # Sidewall filling the inside of the tread, inset slightly so the tread edge stands out. On the road
    # wheels it is a ring of thin blocks: turned squares would reach radius * sqrt(2) at their corners,
    # past the tread and into the flares and bumpers as the wheel spins.
    if axis == "x":
        cubes += ring(center, a0 + 0.2, a1 - 0.2, 2.0, radius - 1.2, 24, "tire")
        cubes += disc(axis, center, 2.1, a0 + 0.2, a1 - 0.2, (0, 30, 60), "tire")
    else:
        cubes += disc(axis, center, radius - 1.2, a0 + 0.2, a1 - 0.2, (0, 30, 60), "tire")
    return cubes


def hub_span(x_out, inner, outer, hub_x=HUB_X):
    """The x span from hub_x + inner to hub_x + outer on the side x_out (+1 = right, -1 = left), low end first."""
    return sorted((x_out * (hub_x + inner), x_out * (hub_x + outer)))


def around_axle(center, x0, x1, r0, r1, half_width, angles, color):
    """Blocks from r0 to r1 out from the axle (along x), half_width wide, one turned to each angle."""
    _, cy, cz = center
    cubes = []
    for angle in angles:
        cube = box(x0, cy + r0, cz - half_width, x1, cy + r1, cz + half_width, color)
        if angle:
            cube["rotation"] = [angle, 0, 0]
            cube["pivot"] = list(center)
        cubes.append(cube)
    return cubes


def ring(center, x0, x1, r0, r1, segments, color):
    """A ring from r0 to r1 around the axle, built from `segments` blocks that overlap a little."""
    half_chord = round(r1 * math.tan(math.radians(180 / segments)) + 0.05, 3)
    return around_axle(center, x0, x1, r0, r1, half_chord, [i * 360 / segments for i in range(segments)], color)


def drawn_wheel(x_out):
    """The 133-cube road wheel in its drawn size, centred on the origin: a lugged tire, a gray barrel behind
    the spokes, a black lip with chrome rivets, black spokes with a machined stripe down each, and a black
    hub with chrome lug nuts and a small center cap. The drawn radius is WHEEL_DRAWN_RADIUS and the drawn
    half tread width WHEEL_DRAWN_HALF_WIDTH. Every turned set is symmetric under reversing its angles, so
    it looks the same whichever way the game turns x rotations."""
    center = (0, 0, 0)
    radius = WHEEL_DRAWN_RADIUS

    def span(inner, outer):
        return hub_span(x_out, inner, outer, hub_x=0)

    rivets = [i * 22.5 for i in range(16)]
    spokes = [22.5 + i * 45 for i in range(8)]
    return [
        *round_tire("x", center, radius, *span(-WHEEL_DRAWN_HALF_WIDTH, WHEEL_DRAWN_HALF_WIDTH), segments=24),
        # Shoulder lugs on every other tread block, standing out of the outer sidewall
        *around_axle(center, *span(1.8, 2.15), radius - 0.9, radius, 0.75, [i * 30 for i in range(12)], "tire"),
        *disc("x", center, 3.6, *span(1.8, 1.85), (0, 30, 60), "trim"),  # barrel behind the spokes
        *ring(center, *span(1.85, 2.2), 3.25, 3.9, 24, "grille"),  # lip
        *around_axle(center, *span(2.2, 2.3), 3.45, 3.7, 0.12, rivets, "rim"),
        *around_axle(center, *span(1.85, 2.2), 1.1, 3.35, 0.42, spokes, "grille"),
        *around_axle(center, *span(2.2, 2.25), 1.5, 3.1, 0.1, spokes, "spoke"),  # machined stripe
        *disc("x", center, 1.25, *span(1.9, 2.35), (0, 30, 60), "grille"),  # hub
        *around_axle(center, *span(2.35, 2.45), 0.75, 0.97, 0.11, [i * 60 for i in range(6)], "rim"),
        *disc("x", center, 0.4, *span(2.35, 2.5), (0, 45), "spoke"),  # center cap
    ]


def place_wheel(cubes, center, axle="x"):
    """Scale a drawn wheel to the model (RADIAL_SCALE across, AXIAL_SCALE along the axle) and move it to
    `center`. The spare's axle is z, its face toward the rear (-z before export): the wheel's x, y and z
    become -z, y and x of the model's frame, a quarter turn about y that keeps the wheel itself."""
    def point(p):
        x, y, z = p[0] * AXIAL_SCALE, p[1] * RADIAL_SCALE, p[2] * RADIAL_SCALE
        offset = (x, y, z) if axle == "x" else (z, y, -x)
        return [center[i] + offset[i] for i in range(3)]

    placed = []
    for cube in cubes:
        low = point(cube["origin"])
        high = point([cube["origin"][i] + cube["size"][i] for i in range(3)])
        moved = {**cube, "origin": [min(a, b) for a, b in zip(low, high)],
                 "size": [abs(a - b) for a, b in zip(low, high)]}
        if "pivot" in cube:
            moved["pivot"] = point(cube["pivot"])
        if axle == "z" and "rotation" in cube:
            moved["rotation"] = [0, 0, -cube["rotation"][0]]
        placed.append(moved)
    return placed


def wheel(name, x_out, z_center):
    """A road wheel: the drawn wheel scaled to the new size (ADR 0214). Nothing reaches past
    HUB_X + HUB_CAP_OUT, where the submarine prop mounts (ADR 0042)."""
    center = (HUB_X * x_out, HUB_Y, z_center)
    return {"name": name, "parent": "root", "pivot": list(center),
            "cubes": place_wheel(drawn_wheel(x_out), center)}


def spare_wheel():
    """The spare on the tailgate: the same wheel, with its axle along z and its face toward the rear."""
    return place_wheel(drawn_wheel(+1), (0, SPARE_Y, SPARE_Z), axle="z")


# Segments of one prop blade: (inner radius, outer radius, half width, sweep in degrees). Each segment
# turns further around the axle than the one inside it, so the blade curves back like a ship
# propeller's scimitar blade (ADR 0042). The farthest corner stays inside the tire's inner radius (4.6).
PROP_BLADE = ((0.9, 2.0, 0.55, 0), (1.9, 3.3, 1.05, 14), (3.2, 4.3, 0.8, 30))


def prop(name, x_out, z_center):
    """A hub and four swept blades mounted on the outer face of the rear wheel's hub cap, in the wheel's
    plane and inside the tire's inner radius, so the tread ring frames the prop."""
    center = (HUB_X * x_out, HUB_Y, z_center)
    _, cy, cz = center
    x0, x1 = hub_span(x_out, HUB_CAP_OUT, HUB_CAP_OUT + 0.6)
    blades = []
    for base in (0, 90, 180, 270):
        for r0, r1, half, sweep in PROP_BLADE:
            r0, r1, half = r0 * RADIAL_SCALE, r1 * RADIAL_SCALE, half * RADIAL_SCALE
            blade = box(x0 + 0.1, cy + r0, cz - half, x1 - 0.1, cy + r1, cz + half, "prop")
            if base + sweep:
                blade["rotation"] = [base + sweep, 0, 0]
                blade["pivot"] = list(center)
            blades.append(blade)
    # The hub stands a little proud of the blades, with a dark bore in its outer face.
    hub0, hub1 = (x0, x1 + 0.2) if x_out > 0 else (x0 - 0.2, x1)
    bore0, bore1 = (hub1, hub1 + 0.05) if x_out > 0 else (hub0 - 0.05, hub0)
    return {
        "name": name,
        "parent": "root",
        "pivot": list(center),
        "cubes": [
            *disc("x", center, 1.4 * RADIAL_SCALE, hub0, hub1, (0, 30, 60), "prop_hub"),
            *disc("x", center, 0.6 * RADIAL_SCALE, bore0, bore1, (0, 45), "tire"),
            *blades,
        ],
    }


def arm(name, x_out, z_center):
    """A straight axle extension whose x scale grows from the beam end to the folded hub.

    The 0.2 px overlap hides the seam where the shaft emerges from the solid axle beam.
    """
    xs = sorted((x_out * (ARM_ROOT_X - 0.2), x_out * (HUB_X + FOLD_OUT)))
    return {
        "name": name,
        "parent": "root",
        "pivot": [x_out * ARM_ROOT_X, ARM_ROOT_Y, z_center],
        "cubes": [box(xs[0], ARM_ROOT_Y - ARM_THICK / 2, z_center - ARM_THICK / 2,
                      xs[1], ARM_ROOT_Y + ARM_THICK / 2, z_center + ARM_THICK / 2, "arm")],
    }


def sub_arm(name, x_out, z_center):
    """A gunmetal arm from the body to the hub of a rear wheel turned for the submarine (ADR 0040), which
    sits SUB_OUT px out with its axle along z. The arm lies against the tire's front face, opposite the
    prop on the rear face. Before turn_around the front is +z. Hidden by scale outside the submarine."""
    s = x_out
    hx = HUB_X + SUB_OUT
    xs = sorted((s * (BODY_HALF_WIDTH - 2), s * (hx + 0.8)))
    face = z_center + TIRE_HALF_WIDTH  # the tire's front face
    return {
        "name": name,
        "parent": "root",
        "pivot": [s * BODY_HALF_WIDTH, HUB_Y, z_center],
        "cubes": [
            box(xs[0], HUB_Y - ARM_THICK / 2, face, xs[1], HUB_Y + ARM_THICK / 2, face + 1.2, "arm"),
            box(s * hx - 1.2, HUB_Y - 1.2, face + 1.2, s * hx + 1.2, HUB_Y + 1.2, face + 1.6, "arm"),
        ],
    }


GLOW_SEGMENTS = 16


def glow(name, x_out, z_center):
    # A disc under the folded wheel (ADR 0022, moved out with it by ADR 0043). The render controller hides
    # it while the gear is down: on the ground and under water.
    x = (HUB_X + FOLD_OUT) * x_out
    return {
        "name": name,
        "parent": "root",
        "pivot": [x, 0, z_center],
        "cubes": disc("y", (x, 0, z_center), GLOW_RADIUS / math.sqrt(2), -0.5, 0,
                      [i * 90 / GLOW_SEGMENTS for i in range(GLOW_SEGMENTS)], "glow"),
        "locators": {name.replace("glow", "hover"): [x, -0.5, z_center]},
    }
