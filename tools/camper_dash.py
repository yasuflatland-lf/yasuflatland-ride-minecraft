"""Build the sill-height cab dashboard and its registered instrument textures."""

import math
import json
from copy import deepcopy
import random
from dataclasses import dataclass
from typing import TYPE_CHECKING
from tool_loader import load_tool

if TYPE_CHECKING:
    from camper_kit import AreaCubes
    from camper_regions import RegionRegistry, RegionRef

Pixel = tuple[int, int, int, int]
Image = list[list[Pixel]]
Cube = dict
PAL: dict[str, Pixel] = {}
DIAL_TEXELS = 128
PAD_SIZE = (184, 48)
RADIO_SIZE = (144, 40)
SMALL_SIZE = (128, 60)
VINYL_SEED = 19
DARK_LACQUER_PIXEL = (72, 77, 76, 255)


FONT = {
'0':['111','101','101','101','111'], '1':['010','110','010','010','111'],
'2':['111','001','111','100','111'], '3':['111','001','111','001','111'],
'4':['101','101','111','001','001'], '5':['111','100','111','001','111'],
'6':['111','100','111','101','111'], '7':['111','001','010','010','010'],
'8':['111','101','111','101','111'], '9':['111','101','111','001','111'],
'T':['111','010','010','010','010'], 'E':['111','100','110','100','111'],
'M':['101','111','111','101','101'], 'P':['110','101','110','100','100'],
'B':['110','101','110','101','110'], 'A':['010','101','111','101','101'],
'F':['111','100','110','100','100'], 'U':['101','101','101','101','111'],
'L':['100','100','100','100','111'], 'O':['111','101','101','101','111'],
'I':['111','010','010','010','111'], 'H':['101','101','111','101','101'],
'C':['111','100','100','100','111'], 'R':['110','101','110','101','101'],
'S':['111','100','111','001','111'], 'N':['101','111','111','111','101'],
'Y':['101','101','010','010','010'], 'G':['111','100','101','101','111'],
}

def patch(w: int, h: int, color: str | Pixel) -> Image:
    return [[PAL.get(color, color)] * w for _ in range(h)]

def snap(value: float, decimals: int = 6) -> float:
    # macOS and Linux libm differ by one ulp; discrete decisions must ignore those last bits.
    return round(value, decimals) + 0.0


def grouping_value(value):
    if isinstance(value, float):
        return snap(value, 9)
    if isinstance(value, (list, tuple)):
        return [grouping_value(v) for v in value]
    if isinstance(value, dict):
        return {k: grouping_value(v) for k, v in value.items()}
    return value


def dot(im: Image, x: float, y: float, c: str | Pixel) -> None:
    x, y = int(snap(x)), int(snap(y))
    if 0 <= y < len(im) and 0 <= x < len(im[0]):
        im[y][x] = PAL.get(c, c)

def line(im: Image, x: float, y: float, a: float, b: float, c: str | Pixel, width: int=1) -> None:
    n = max(1, int(snap(math.hypot(a - x, b - y) * 2)))
    for i in range(n + 1):
        for dy in range(-(width // 2), width // 2 + 1):
            for dx in range(-(width // 2), width // 2 + 1):
                dot(im, round(snap(x + (a - x) * i / n)) + dx, round(snap(y + (b - y) * i / n)) + dy, c)

def text(im: Image, s: str, x: int, y: int, c: str | Pixel='black', scale: int=1) -> None:
    for ch in s:
        for yy, row in enumerate(FONT.get(ch, ['000'] * 5)):
            for xx, v in enumerate(row):
                if v == '1':
                    for dy in range(scale):
                        for dx in range(scale):
                            dot(im, x + xx * scale + dx, y + yy * scale + dy, c)
        x += 4 * scale

def circle(im: Image, x: float, y: float, r: float, c: str | Pixel) -> None:
    for yy in range(max(0, int(snap(y - r))), min(len(im), int(snap(y + r)) + 1)):
        for xx in range(max(0, int(snap(x - r))), min(len(im[0]), int(snap(x + r)) + 1)):
            if snap((xx - x) ** 2 + (yy - y) ** 2 - r * r) <= 0:
                dot(im, xx, yy, c)

def dial(kind: str) -> Image:
    im = patch(DIAL_TEXELS, DIAL_TEXELS, 'dash_pad')
    cx = cy = 63.5
    for y in range(DIAL_TEXELS):
        for x in range(DIAL_TEXELS):
            r = snap(math.hypot(x - cx, y - cy))
            if r < 63:
                col = 'chrome' if r > 59 else 'steel' if r > 57 else 'ivory'
                if r > 59 and (x + y) % 11 < 3:
                    col = 'white'
                dot(im, x, y, col)
    if kind == 'speed':
        circle(im, cx, cy, 32, 'black')
        for i in range(46):
            a = math.radians(140 + i * 260 / 45)
            r0 = 49 if i % 5 == 0 else 52
            line(im, cx + r0 * math.cos(a), cy + r0 * math.sin(a), cx + 55 * math.cos(a), cy + 55 * math.sin(a), 'black', 1)
        for i in range(10):
            a = math.radians(140 + i * 260 / 9)
            s = str(i * 10)
            text(im, s, round(snap(cx + 43 * math.cos(a) - len(s) * 4 + 1)), round(snap(cy + 43 * math.sin(a) - 5)), 'black', 2)
        for y in range(44, 54):
            for x in range(41, 88):
                dot(im, x, y, 'steel' if y in (44, 53) else 'black')
        text(im, '527889', 43, 46, 'ivory', 1)
        circle(im, cx, cy, 16, 'chrome')
        circle(im, cx, cy, 14, 'steel')
        line(im, cx, cy, 26, 98, 'red', 3)
        circle(im, cx, cy, 3, 'red')
    else:
        circle(im, cx, cy, 29, 'black')
        for a0, label, ends in ((225, 'TEMP', 'CH'), (315, 'BATT', 'DC'), (135, 'FUEL', 'EF'), (45, 'OIL', '08')):
            a = math.radians(a0)
            qx = cx + 35 * math.cos(a)
            qy = cy + 35 * math.sin(a)
            text(im, label, round(snap(qx - len(label) * 2)), round(snap(qy - 3)))
            for j in range(7):
                t = math.radians(a0 - 25 + j * 50 / 6)
                line(im, cx + 45 * math.cos(t), cy + 45 * math.sin(t), cx + 50 * math.cos(t), cy + 50 * math.sin(t), 'black')
            for j, ch in enumerate(ends):
                t = math.radians(a0 - 27 + j * 54)
                text(im, ch, round(snap(cx + 54 * math.cos(t) - 1)), round(snap(cy + 54 * math.sin(t) - 2)))
            t = math.radians(a0 - 8)
            line(im, cx + 31 * math.cos(t), cy + 31 * math.sin(t), cx + 49 * math.cos(t), cy + 49 * math.sin(t), 'red', 2)
        circle(im, cx, cy, 16, 'chrome')
        circle(im, cx, cy, 14, 'steel')
    return im

def vinyl(color: str, w: int, h: int, ribs: bool) -> Image:
    im = patch(w, h, color)
    base = PAL[color]
    rng = random.Random(VINYL_SEED)
    for y in range(h):
        for x in range(w):
            d = rng.choice((-3, 0, 0, 0, 3))
            if ribs:
                phase = x % 12
                d += -15 if phase < 1 else 7 if phase < 3 else 0
                if phase == 2 and y % 6 < 2:
                    d += 18
            if y in (3, h - 4) and x % 6 < 3:
                d += 15
            im[y][x] = tuple((max(0, min(255, c + d)) for c in base[:3])) + (255,)
    return im

def instrument_images() -> dict[str, Image]:
    radio = patch(*RADIO_SIZE, 'chrome')
    for y in range(6, 34):
        for x in range(26, 118):
            dot(radio, x, y, 'black')
    for x in range(30, 116, 5):
        line(radio, x, 11, x, 18 if x % 10 else 23, 'ivory')
    text(radio, '55 70 90 110', 30, 25, 'ivory')
    line(radio, 76, 8, 76, 30, 'red', 2)
    for x in (13, 131):
        circle(radio, x, 20, 10, 'steel')
        circle(radio, x, 20, 7, 'black')
        line(radio, x, 14, x, 20, 'ivory')
    small = patch(*SMALL_SIZE, 'steel')
    for x in (32, 96):
        circle(small, x, 30, 27, 'chrome')
        circle(small, x, 30, 23, 'black')
        for i in range(9):
            a = math.radians(140 + i * 32)
            line(small, x + 18 * math.cos(a), 30 + 18 * math.sin(a), x + 21 * math.cos(a), 30 + 21 * math.sin(a), 'ivory')
        line(small, x, 30, x - 13, 18, 'red', 2)
    text(small, 'OIL', 26, 40, 'ivory')
    text(small, 'TEMP', 88, 40, 'ivory')
    return {'SPEED': dial('speed'), 'QUAD': dial('quad'), 'PAD': vinyl('dash_pad', *PAD_SIZE, False), 'RADIO': radio, 'SMALL': small, 'DARK19': [[DARK_LACQUER_PIXEL]]}


def register_regions(registry: 'RegionRegistry', palette: dict[str, Pixel] | None=None) -> dict[str, 'RegionRef']:
    global PAL
    PAL = palette if palette is not None else load_tool('camper_kit').PALETTE
    regions = load_tool('camper_regions')
    materials = (regions.Material.GLASS_COAT, regions.Material.GLASS_COAT, regions.Material.VINYL, regions.Material.METAL, regions.Material.GLASS_COAT, regions.Material.DARK_LACQUER)
    return {name: registry.register(regions.Region('cab ' + name, len(image[0]), len(image), material, lambda x, y, image=image: image[y][x])) for (name, image), material in zip(instrument_images().items(), materials)}


# The traced profile is measured from the owner's approved cab study (ADR 0106).
SILL_Y = 35.0
DASH_SHIFT = 6.0
DASH_HALF_WIDTH = 23.2
MASS_STRIPS = 96
SHELF_STRIPS = 192
TRACE_SCALE = 28
TRACE_REFERENCE = (360, 300)
TRACE_Z = -50.7
TRACE_POINTS = ((195, 301), (352, 401), (347, 417), (219, 640))
TOP, TRACE_END, TRACE_EDGE, TRACE_CHIN = tuple(
    (TRACE_Z + (x - TRACE_REFERENCE[0]) / TRACE_SCALE,
     SILL_Y - (y - TRACE_REFERENCE[1]) / TRACE_SCALE) for x, y in TRACE_POINTS)
TOP = (TOP[0], SILL_Y)
FACE_SLOPE = (TOP[1] - TRACE_END[1]) / (TRACE_END[0] - TOP[0])
FACE_ANGLE = 90 - math.degrees(math.atan(FACE_SLOPE))
COLUMN_HUB = (-14.29, 35.2, -50.7)
CHIN_ANGLE = 60.0
BOTTOM_Y = TRACE_CHIN[1]
FRONT_YAW = 8.0
FRONT_SLOPE = .15
WINDSHIELD_Z = -53.5
CAB_HALF_WIDTH = 24.0
FRONT_WALL_Z = -61.738
FRONT_WALL_Y = 34.05
HOOD_SLOPE_ANGLE = 20.684
HOOD_LIMIT_Y = 35.62
WALL_BASE_Y = 15.7
WALL_STRIPS = 48
WALL_INSET = .2
SHELF_FRONT_GAP = .02
FACE_START_GAP = .1
FACE_EDGE_GAP = .01
END_X = (-23.25,22.65)
END_PROFILE_X = 22.95
END_WALL_OVERLAP = .3
CLOSURE_X = -23.25
CLOSURE_WIDTH = 46.5
CLOSURE_RECESS = .09
CLOSURE_DEPTH = .12
SWITCH_ROW = ((-1,.55),(0,.55),(1,.55),(-1,-.5),(0,-.5),(1,-.5))
GAUGES = ((-18.8,2.85,'QUAD'),(-12.7,3.05,'SPEED'))
FASCIA_FITTINGS = (
    (11.3,31.65,10.1,2.7,.08,'dark_dash',0),
    (11.45,31.8,9.8,2.4,.08,'wood',.1),
    (15.7,33.5,1.3,.3,.15,'chrome',.22),
    (-14.59,30.17,.6,.6,.15,'chrome',.01),
    (-14.34,30.32,.15,.4,.25,'steel',.18),
    (-14.44,29.72,.35,.6,.1,'steel',.44),
    (-1.1,33.55,2.5,.9,.1,'chrome',0))
CORE_TOP_Y = 34.89999
SHELF_THICKNESS = .1
FACE_THICKNESS = .065
END_THICKNESS = .6
LOWER_ANGLE = 35.0
CONTROL_SHIFT = -3.0
CLUSTER_REFERENCE_X = -4.523374167805887
CLUSTER_INBOARD_SHIFT = 4.0
CLUSTER_X = CLUSTER_REFERENCE_X + CLUSTER_INBOARD_SHIFT


def column_axis(y: float) -> float:
    return COLUMN_HUB[2] + (y - COLUMN_HUB[1]) / math.tan(math.radians(CHIN_ANGLE))


END_Y = (TOP[0] + SILL_Y / FACE_SLOPE - COLUMN_HUB[2]
         + COLUMN_HUB[1] / math.sqrt(3)) / (1 / FACE_SLOPE + 1 / math.sqrt(3))
END = (column_axis(END_Y), END_Y)
FACE_LENGTH = math.dist(TOP, END)


@dataclass(frozen=True)
class DashGeometry:
    face_origin: tuple[float, float, float]
    face_normal: tuple[float, float, float]
    shelf_y: float
    column_entry: tuple[float, float, float]
    chin_line: tuple[tuple[float, float], tuple[float, float]]


DASH_GEOMETRY = DashGeometry(
    (0, SILL_Y, TOP[0] + DASH_SHIFT),
    (0, math.sin(math.radians(FACE_ANGLE)), math.cos(math.radians(FACE_ANGLE))),
    SILL_Y, (-COLUMN_HUB[0], END_Y, END[0] + DASH_SHIFT),
    ((column_axis(BOTTOM_Y) + DASH_SHIFT, BOTTOM_Y), (END[0] + DASH_SHIFT, END_Y)))


def windshield_v(x: float) -> float:
    return WINDSHIELD_Z - CAB_HALF_WIDTH * math.tan(math.radians(FRONT_YAW)) + abs(x) * math.tan(math.radians(FRONT_YAW))


def front_wall(x: float, y: float) -> float:
    return FRONT_WALL_Z + abs(x) * math.tan(math.radians(FRONT_YAW)) + FRONT_SLOPE * (FRONT_WALL_Y - y)


def clip_hood(poly: list[tuple[float, float]], x: float) -> list[tuple[float, float]]:
    v = windshield_v(x)
    slope = math.tan(math.radians(HOOD_SLOPE_ANGLE))
    front = FRONT_WALL_Z + abs(x) * math.tan(math.radians(FRONT_YAW))
    for distance in (lambda p: p[1] - HOOD_LIMIT_Y - (p[0] - v) * slope,
                     lambda p: front + FRONT_SLOPE * (FRONT_WALL_Y - p[1]) + .1 - p[0]):
        out = []
        for a, b in zip(poly, poly[1:] + poly[:1]):
            da, db = distance(a), distance(b)
            if (da <= 0) != (db <= 0):
                t = da / (da - db)
                out.append(tuple(a[j] + t * (b[j] - a[j]) for j in range(2)))
            if db <= 0:
                out.append(b)
        poly = out
    return poly


def intersections(poly: list[tuple[float, float]], y: float) -> tuple[float, float]:
    zs = [a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1])
          for a, b in zip(poly, poly[1:] + poly[:1])
          if min(a[1], b[1]) - 1e-8 <= y <= max(a[1], b[1]) + 1e-8 and abs(a[1] - b[1]) > 1e-8]
    return min(zs), max(zs)


class DashBuilder:
    def __init__(self, registry: "RegionRegistry") -> None:
        self.registry = registry
        self.kit = load_tool("camper_kit")
        regions = load_tool("camper_regions")
        self.refs = {r.name: regions.RegionRef(registry, r) for r in registry.regions()}

    def swatch(self, name: str) -> dict:
        return {'uv': list(self.refs['base'].uv(self.kit.SLOTS.index(name), 0)), 'uv_size': [1, 1]}

    def box(self, x: float, y: float, z: float, w: float, h: float, d: float, color: str) -> Cube:
        return {'origin': [x, y, z], 'size': [w, h, d],
                'uv': {f: self.swatch(color) for f in ('north', 'south', 'east', 'west', 'up', 'down')}}

    def texture(self, cube: Cube, name: str, face: str = 'south') -> Cube:
        ref = self.refs['cab ' + name]
        w, h = ref.region.width, ref.region.height
        cube['uv'][face] = {'uv': list(ref.uv(w if face == 'south' else 0, 0)),
                            'uv_size': [-w if face == 'south' else w, h]}
        return cube

    def green(self, cube: Cube) -> Cube:
        for f in cube['uv']:
            self.texture(cube, 'PAD', f)
        return cube

    def mass(self, poly: list[tuple[float, float]], x: float, width: float,
             color: str, core_gap: bool = False) -> list[Cube]:
        cubes = []
        ys = sorted(set(round(v[1], 9) for v in poly))
        for ya, yb in zip(ys, ys[1:]):
            if yb - ya < 1e-6:
                continue
            za, ra = intersections(poly, ya + 1e-8)
            zb, rb = intersections(poly, yb - 1e-8)
            front, rear = max(za, zb), min(ra, rb)
            if not core_gap and abs(yb - SILL_Y) < 1e-6:
                # The side-wall overlap closes the clipped cap's top-front corner.
                front = min(za, zb)
            if rear > front:
                height = yb - ya + (.00001 if core_gap else .002)
                cubes.append(self.box(x, ya, front, width, height,
                                      rear - front + (.00001 if core_gap else .015), color))
            for z0, z1, side in ((ra, rb, 1), (za, zb, -1)):
                dy, dz = yb - ya, z1 - z0
                if abs(dz) < 1e-6:
                    continue
                length = math.hypot(dy, dz)
                thick = max(.1, abs(dz) * dy / length + .03)
                c = self.box(x, ya, z0 - thick if side == 1 else z0, width, length, thick, color)
                c['pivot'], c['rotation'] = [0, ya, z0], [math.degrees(math.atan2(-dz, dy)), 0, 0]
                cubes.append(c)
        return cubes

    def panel(self, cube: Cube) -> Cube:
        cube['pivot'] = list(DASH_GEOMETRY.face_origin)
        cube['rotation'] = [FACE_ANGLE, 0, 0]
        return cube

    def fittings(self) -> list[Cube]:
        out = []
        z = TOP[0] + DASH_SHIFT + .02
        def add(x: float, y: float, w: float, h: float, d: float, color: str,
                dz: float = 0, region: str | None = None) -> None:
            c = self.panel(self.box(x, y, z + dz, w, h, d, color))
            if region:
                self.texture(c, region)
            out.append(c)
        for x, size, region in GAUGES:
            add(x-size/2, 33.05-size/2, size, size, .1, 'dash_pad', region=region)
        for dx, dy in SWITCH_ROW:
            x, y = CLUSTER_X + CONTROL_SHIFT + dx, 33.05 + dy
            add(x-.25,y-.25,.5,.5,.13,'chrome')
            add(x-.16,y-.16,.32,.32,.25,'black',.13)
        add(2,32.225,7.6,1.65,.25,'chrome',region='RADIO')
        for args in FASCIA_FITTINGS:
            add(*args)
        for i in range(4):
            add(-.92,33.65+i*.17,2.14,.09,.1,'dark_dash',.13)
        lower_x = CLUSTER_X + CONTROL_SHIFT
        lower = self.texture(self.box(lower_x-2.7, END_Y-2.18, END[0]+DASH_SHIFT+.12,
                                     5.4,2.18,.12,'chrome'), 'SMALL')
        # The spike translates the panel toward the wheel while retaining its mounting pivot.
        lower['pivot'] = [lower_x - CONTROL_SHIFT, END_Y, END[0]+DASH_SHIFT+.12]
        lower['rotation'] = [LOWER_ANGLE,0,0]
        out.append(lower)
        for x in (lower_x-2.35, lower_x+2.35):
            out.append(self.box(x-.12, END_Y-.12, END[0]+DASH_SHIFT-.25,.24,.24,.55,'chrome'))
        return out


def tile_mass(cubes: list[Cube]) -> list[Cube]:
    """Preserve the exact uniform-solid union while sweeping its shared boundaries."""
    groups: dict[str, list[Cube]] = {}
    rest = []
    for c in cubes:
        if c.get('rotation'):
            rest.append(c)
        else:
            key = json.dumps(grouping_value([c['origin'][1],c['size'][1],c['uv']]),sort_keys=True)
            groups.setdefault(key,[]).append(c)
    out = []
    for group in groups.values():
        zs = sorted({round(c['origin'][2]+s*c['size'][2],9) for c in group for s in (0,1)})
        for z0,z1 in zip(zs,zs[1:]):
            mid = (z0+z1)/2
            intervals = sorted((round(c['origin'][0],9),round(c['origin'][0]+c['size'][0],9))
                               for c in group if c['origin'][2]-1e-9 < mid < c['origin'][2]+c['size'][2]+1e-9)
            spans = []
            for lo,hi in intervals:
                if spans and lo <= spans[-1][1]+1e-9:
                    spans[-1][1] = max(spans[-1][1],hi)
                else:
                    spans.append([lo,hi])
            for lo,hi in spans:
                c = deepcopy(group[0])
                c['origin'][0],c['origin'][2] = lo,z0
                c['size'][0],c['size'][2] = hi-lo,z1-z0
                out.append(c)
    # Adjacent strips with an identical swatch can join along their local x axis.
    groups = {}
    for c in out+rest:
        key = json.dumps(grouping_value([{k:v for k,v in c.items() if k not in ('origin','size')},
                                         c['origin'][1:]+c['size'][1:]]),sort_keys=True)
        groups.setdefault(key,[]).append(c)
    out = []
    for group in groups.values():
        previous = None
        for c in sorted(group,key=lambda c:c['origin'][0]):
            if previous is not None and abs(previous['origin'][0]+previous['size'][0]-c['origin'][0])<1e-8:
                previous['size'][0] += c['size'][0]
            else:
                out.append(c)
                previous = c
    return out


def build_dash(registry: "RegionRegistry") -> "AreaCubes":
    b = DashBuilder(registry)
    cubes = b.fittings()
    mass = []
    for i in range(MASS_STRIPS):
        width = 2 * DASH_HALF_WIDTH / MASS_STRIPS
        x = -DASH_HALF_WIDTH + i * width
        center = x + width / 2
        poly = [(front_wall(center,BOTTOM_Y)-.2,BOTTOM_Y),
                (column_axis(BOTTOM_Y),BOTTOM_Y),END,TOP,(front_wall(center,SILL_Y)-.2,SILL_Y)]
        for c in b.mass(clip_hood(poly,center),x,width,'dark_dash',True):
            c['origin'][2] += DASH_SHIFT
            if 'pivot' in c:
                c['pivot'][2] += DASH_SHIFT
            mass.append(c)
        start = max(TOP[0],windshield_v(x),windshield_v(x+width)) + FACE_START_GAP
        y = SILL_Y - (start-TOP[0]) * FACE_SLOPE
        if y > END_Y + FACE_EDGE_GAP:
            length = (y-END_Y) / math.cos(math.radians(FACE_ANGLE))
            c = b.green(b.box(x,END_Y,END[0]+DASH_SHIFT,width,length,FACE_THICKNESS,'dash_pad'))
            c['pivot'],c['rotation'] = [0,END_Y,END[0]+DASH_SHIFT],[FACE_ANGLE,0,0]
            cubes.append(c)
    for c in tile_mass(mass):
        if not c.get('rotation') and abs(c['origin'][1]+c['size'][1]-SILL_Y)<.0001:
            c['size'][1] = CORE_TOP_Y - c['origin'][1]
        cubes.append(c)
    for i in range(SHELF_STRIPS):
        width = 2 * DASH_HALF_WIDTH / SHELF_STRIPS
        x = -DASH_HALF_WIDTH + i * width
        front = max(windshield_v(x),windshield_v(x+width)) + SHELF_FRONT_GAP
        cubes.append(b.green(b.box(x,SILL_Y-SHELF_THICKNESS,front,width,SHELF_THICKNESS,
                                   TOP[0]+DASH_SHIFT-front,'dash_pad')))
    # Retain the front-wall return beneath the chin, as in build18.
    for i in range(WALL_STRIPS):
        width = 2 * DASH_HALF_WIDTH / WALL_STRIPS
        x = -DASH_HALF_WIDTH + i * width
        z = front_wall(x+width/2,WALL_BASE_Y)-WALL_INSET+DASH_SHIFT
        c = b.box(x,WALL_BASE_Y,z,width,(BOTTOM_Y-WALL_BASE_Y)*math.sqrt(1+FRONT_SLOPE**2),1,'dark_dash')
        c['pivot'],c['rotation'] = [0,WALL_BASE_Y,z],[math.degrees(math.atan(FRONT_SLOPE)),0,0]
        cubes.append(c)
    c = b.green(b.box(CLOSURE_X,END_Y,END[0]+DASH_SHIFT-CLOSURE_RECESS,CLOSURE_WIDTH,FACE_LENGTH - (CLOSURE_DEPTH-CLOSURE_RECESS) * math.tan(math.radians(FACE_ANGLE)),CLOSURE_DEPTH,'dash_pad'))
    c['pivot'],c['rotation'] = [0,END_Y,END[0]+DASH_SHIFT],[FACE_ANGLE,0,0]
    cubes.append(c)
    for x in END_X:
        poly = [(front_wall(END_PROFILE_X,BOTTOM_Y)+DASH_SHIFT-END_WALL_OVERLAP,BOTTOM_Y),
                (column_axis(BOTTOM_Y)+DASH_SHIFT,BOTTOM_Y),
                (END[0]+DASH_SHIFT,END_Y),(TOP[0]+DASH_SHIFT,SILL_Y),
                (front_wall(END_PROFILE_X,SILL_Y)+DASH_SHIFT-END_WALL_OVERLAP,SILL_Y)]
        cubes.extend(b.mass(poly,x,END_THICKNESS,'dash'))
    # Thickness at a tilted cap must terminate below the horizontal sill datum.
    for c in cubes:
        if 'rotation' not in c:
            c['size'][1] = min(c['size'][1],SILL_Y-c['origin'][1])
            continue
        angle = math.radians(c['rotation'][0])
        co, si = math.cos(angle), math.sin(angle)
        py, pz = c['pivot'][1:]
        top = max(py + (y-py)*co + (z-pz)*si
                  for y in (c['origin'][1],c['origin'][1]+c['size'][1])
                  for z in (c['origin'][2],c['origin'][2]+c['size'][2]))
        if top > SILL_Y:
            c['size'][1] -= (top-SILL_Y)/co
    # Area modules build +x right; the spike's traced coordinates are already game-facing.
    for c in cubes:
        c['origin'][0] = -c['origin'][0]-c['size'][0]
        c['uv']['east'],c['uv']['west'] = c['uv']['west'],c['uv']['east']
        if 'pivot' in c:
            c['pivot'][0] = -c['pivot'][0]
    return b.kit.AreaCubes({'body':cubes})
