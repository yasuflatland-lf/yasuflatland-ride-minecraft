"""Build the camper running area."""

from tool_loader import load_tool

kit = load_tool("camper_kit")
AreaCubes = kit.AreaCubes
BOTTOM = kit.BOTTOM
FRONT = kit.FRONT
GLOW_BOTTOM = kit.GLOW_BOTTOM
GLOW_RADIUS = kit.GLOW_RADIUS
GLOW_SEGMENTS = kit.GLOW_SEGMENTS
HW = kit.HW
REAR = kit.REAR
WHEEL_R = kit.WHEEL_R
box = kit.box
disc = kit.disc

AREA = "running"


def build() -> AreaCubes:
    body = []
    # --- Chassis and wheels -----------------------------------------------------
    body.append(box(-18, 5, FRONT + 2, 18, BOTTOM + 1, REAR - 2, "black"))
    wheels = {}
    glows = {}
    for name, sx, center_x, z in kit.wheel_positions():
        cubes = []
        glows[f"glow_{name}"] = disc("y", center_x, 0, z, GLOW_RADIUS, GLOW_BOTTOM, "glow",
                                    steps=tuple(i * 90 / GLOW_SEGMENTS for i in range(GLOW_SEGMENTS)),
                                    square=True)
        x_out = sx * (HW - 0.6)
        cubes += disc("x", min(x_out, x_out - sx * 4), WHEEL_R, z, WHEEL_R, 4, "tire")
        face_x = x_out if sx > 0 else x_out - 0.3
        cubes += disc("x", face_x, WHEEL_R, z, 5.28, 0.3, "rim")  # white steel wheel
        cubes += disc("x", face_x + sx * 0.15, WHEEL_R, z, 3.6, 0.3, "slat")
        cubes += disc("x", face_x + sx * 0.3, WHEEL_R, z, 2.04, 0.3, "chrome")

        wheels[f"wheel_{name}"] = cubes

    return AreaCubes({"body": body, **wheels, **glows})
