"""tail_lamp block painter, owned by SUV detail 14/17."""

from tool_loader import load_tool

palette = load_tool("suv_palette")
RegionSpec = load_tool("suv_texture").RegionSpec
FACE_WIDTH, FACE_HEIGHT = 12, 24
THIRD_WIDTH, THIRD_HEIGHT = 12, 3
FRAME_WIDTH = 1
CHAMFER_WIDTH = FACE_WIDTH // 4
LED_LEFT, LED_RIGHT = 2, 10
LED_ROWS = ((2, 4), (5, 7))
REVERSE_LEFT, REVERSE_TOP, REVERSE_SIZE = 3, 9, 6
LENS = palette.PALETTE["tail"]
FRAME = tuple(channel // 2 for channel in LENS)
CHAMFER = palette.PALETTE["resin"]
LED = tuple(min(255, round(channel * 1.4)) for channel in LENS)
REVERSE = palette.PALETTE["light"]
REGIONS = (
    RegionSpec("tail_face", FACE_WIDTH, FACE_HEIGHT, "tail"),
    RegionSpec("third_brake", THIRD_WIDTH, THIRD_HEIGHT, "tail"),
)


def housing(u, v):
    return (u < FRAME_WIDTH or u >= FACE_WIDTH - FRAME_WIDTH or
            v < FRAME_WIDTH or v >= FACE_HEIGHT - FRAME_WIDTH)


def chamfer(u, v):
    # North-face u grows toward +x, the outer side before mirroring and export.
    return u - v >= FACE_WIDTH - CHAMFER_WIDTH


def reverse_lamp(u, v):
    return (REVERSE_LEFT <= u < REVERSE_LEFT + REVERSE_SIZE and
            REVERSE_TOP <= v < REVERSE_TOP + REVERSE_SIZE)


def color(region, u, v, paint):
    if region == "third_brake":
        rgb = LED
    elif chamfer(u, v):
        rgb = CHAMFER
    elif housing(u, v):
        rgb = FRAME
    elif reverse_lamp(u, v):
        rgb = REVERSE
    elif lit(region, u, v):
        rgb = LED
    else:
        rgb = LENS
    return (*rgb, 255)


def mer(region, u, v, paint):
    return None


def lit(region, u, v):
    if region == "third_brake":
        return True
    if housing(u, v) or chamfer(u, v):
        return False
    return reverse_lamp(u, v) or (
        LED_LEFT <= u < LED_RIGHT and any(top <= v < bottom for top, bottom in LED_ROWS))


def relief(region, u, v):
    return None
