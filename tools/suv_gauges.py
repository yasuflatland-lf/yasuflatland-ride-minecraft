"""SUV instrument panel and gauge dials."""

from tool_loader import load_tool

globals().update({k: v for k, v in vars(load_tool("suv_dims")).items() if k.isupper()})
suv_cubes = load_tool("suv_cubes")
suv_atlas = load_tool("suv_atlas")
box = suv_cubes.box
translate = suv_cubes.translate


# Dials sit on the dash slab's rear face; the instrument panel behind it is
# buried in the slab. Leave a 0.01 gap to avoid z-fighting, with the ring
# projecting 0.35 forward of the 0.04-thick face and the hub between them.
SLAB_FACE_Z = DASH_FACE_Z - DASH_SHIFT_Z
FACE_BACK_Z = SLAB_FACE_Z - 0.01
FACE_Z = FACE_BACK_Z - 0.04
RING_FRONT_Z = FACE_Z - 0.35
HUB_FRONT_Z = FACE_Z - 0.15


def dial(cx, cy, radius, name):
    center = (cx, cy, 10)
    cubes = suv_cubes.round_face(center, radius + 0.25, RING_FRONT_Z, FACE_Z, "chrome", inner_radius=radius)
    spec = suv_atlas.region_spec("gauges", name)
    faces = suv_cubes.region_faces("gauges", name, {"north": (0, 0, spec.w, spec.h)})
    cubes.append(box(cx - radius, cy - radius, FACE_Z, cx + radius, cy + radius, FACE_BACK_Z, faces))
    cubes.append(box(cx - 0.15, cy - 0.15, HUB_FRONT_Z, cx + 0.15, cy + 0.15, FACE_Z, "trim"))
    return cubes


def gauge_cluster_cubes():
    panel = suv_cubes.region_faces("dash", "grain", {face: (0, 0, 32, 32) for face in ("north", "south", "east", "west", "up", "down")})
    gauges = [box(1.6, 15.6, 10.5, 10.4, 20.9, 10.9, panel)]
    gauges += dial(3.4, 18.2, 1.25, "tach")
    gauges += dial(6.0, 18.2, 1.0, "fuel_temp")
    gauges += dial(8.6, 18.2, 1.25, "speed")
    # The raked glass requires the cluster to sit lower inside the cabin (ADR 0170).
    translate(gauges, 1, -DASH_GAUGE_DROP)
    translate(gauges, 2, DASH_SHIFT_Z)
    return gauges
