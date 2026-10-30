"""SUV instrument panel and gauge dials."""

from tool_loader import load_tool

globals().update({k: v for k, v in vars(load_tool("suv_dims")).items() if k.isupper()})
suv_cubes = load_tool("suv_cubes")
box = suv_cubes.box
translate = suv_cubes.translate


# The ring projects 0.35 forward of the face. The face is 0.04 thick, with its
# back 0.01 in front of the panel at z 10.5 to avoid z-fighting. The hub sits
# between the ring front and the face.
RING_FRONT_Z, FACE_Z = 10.1, 10.45
FACE_BACK_Z = 10.49
HUB_FRONT_Z = 10.3


def dial(cx, cy, radius, name):
    center = (cx, cy, 10)
    cubes = suv_cubes.round_face(center, radius + 0.25, RING_FRONT_Z, FACE_Z, "chrome", inner_radius=radius)
    faces = suv_cubes.whole_region_faces("gauges", name, ("north",))
    cubes.append(box(cx - radius, cy - radius, FACE_Z, cx + radius, cy + radius, FACE_BACK_Z, faces))
    cubes.append(box(cx - 0.15, cy - 0.15, HUB_FRONT_Z, cx + 0.15, cy + 0.15, FACE_Z, "trim"))
    return cubes


def gauge_cluster_cubes():
    panel = suv_cubes.whole_region_faces("dash", "grain")
    gauges = [box(1.6, 15.6, 10.5, 10.4, 20.9, 10.9, panel)]
    gauges += dial(3.4, 18.2, 1.25, "tach")
    gauges += dial(6.0, 18.2, 1.0, "fuel_temp")
    gauges += dial(8.6, 18.2, 1.25, "speed")
    # The raked glass requires the cluster to sit lower inside the cabin (ADR 0170).
    translate(gauges, 1, -DASH_GAUGE_DROP)
    translate(gauges, 2, DASH_SHIFT_Z)
    return gauges
