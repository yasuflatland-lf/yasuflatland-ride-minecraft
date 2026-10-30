"""SUV instrument panel and gauge dials."""

import math

from tool_loader import load_tool

globals().update({k: v for k, v in vars(load_tool("suv_dims")).items() if k.isupper()})
suv_cubes = load_tool("suv_cubes")
box = suv_cubes.box
round_face = suv_cubes.round_face
translate = suv_cubes.translate


# Gauges (behind the steering wheel, on the driver's side of the dashboard), like an old utility
# 4x4: a black instrument panel with a large speedometer in the middle and two small gauges on each
# side. Every dial has a black face, white ticks and a white needle, in a chrome bezel. No logo or
# lettering (ADR 0009).
def dial(cx, cy, radius, ticks, needle_angle):
    center = (cx, cy, 10)
    cubes = round_face(center, radius + 0.25, 10, 10.5, "rim")  # bezel
    cubes += round_face(center, radius, 9.9, 10, "grille")  # face
    # Ticks on a 270° sweep that leaves the bottom open, as on a speedometer
    for i in range(ticks):
        angle = math.radians(225 - i * 270 / (ticks - 1))
        tx, ty = cx + radius * 0.78 * math.cos(angle), cy + radius * 0.78 * math.sin(angle)
        cubes.append(box(tx - 0.08, ty - 0.08, 9.85, tx + 0.08, ty + 0.08, 9.9, "gauge"))
    needle = box(cx - 0.06, cy, 9.8, cx + 0.06, cy + radius * 0.7, 9.85, "gauge")
    needle["pivot"] = list(center)
    needle["rotation"] = [0, 0, needle_angle]
    cubes.append(needle)
    cubes.append(box(cx - 0.15, cy - 0.15, 9.78, cx + 0.15, cy + 0.15, 9.85, "trim"))  # needle hub
    return cubes


def gauge_cluster_cubes():
    gauges = [box(1.6, 15.6, 10.5, 10.4, 20.9, 10.9, "grille")]  # instrument panel
    gauges += dial(6, 18.2, 1.8, 9, 40)  # speedometer
    for gx in (3.3, 8.7):
        gauges += dial(gx, 19.3, 0.85, 5, 30)
        gauges += dial(gx, 17.2, 0.85, 5, -30)
    # The raked glass crosses the old instrument panel height; lower the cluster to keep it inside
    # the cabin without bringing the steering wheel behind the rider (ADR 0170).
    translate(gauges, 1, -DASH_GAUGE_DROP)
    translate(gauges, 2, DASH_SHIFT_Z)
    return gauges
