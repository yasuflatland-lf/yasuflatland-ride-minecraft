"""Light rounded cab buckets, built in game coordinates before the shared mirror."""

import math
from tool_loader import load_tool

kit = load_tool("camper_kit")
textures = load_tool("camper_seat_textures")
tilt = load_tool("cube_tilt")
AREA = "cab_seats"
AreaCubes = kit.AreaCubes
SEAT_CENTERS = (-12.5, 12.5)
BACK_ROWS, COLUMNS, PAN_ROWS = 17, 9, 13
BACK_BOTTOM, BACK_HEIGHT = 28, 15.8
BACK_SHOULDER_Y, BACK_SHOULDER_R, BACK_TOP_HALF = 40.6, 3.2, 2.9
BACK_LOWER_Y, BACK_LOWER_R, BACK_LOWER_HALF = 29.2, 1.2, 4.9
BACK_HALF = 6.1
BACK_Z, BACK_SLOPE = -29.8, .205
LUMBAR_Y, LUMBAR_WIDTH, LUMBAR_DEPTH = 32, 2.1, .85
BACK_ROLL_WIDTH, BACK_ROLL_DEPTH, SIDE_BOLSTER = .85, .75, 1.55
BACK_THICKNESS, BACK_CROWN = 1.15, .38
PAN_FRONT, PAN_DEPTH, PAN_BASE = -41.15, 12.15, 24.4
PAN_CORNER_R, PAN_CORNER_HALF, PAN_HALF = 1.9, 4.65, 6.55
PAN_FRONT_TANGENT, PAN_REAR_TANGENT = -39.25, -30.9
PAN_TOP, PAN_BOLSTER, PAN_DISH = 27.68, .36, .20
WATERFALL_DEPTH, WATERFALL_WIDTH = 1.48, .72
DERIVATIVE_STEP = .01
BACK_OVERLAP, PAN_OVERLAP, PIPE_OVERLAP = .12, .035, .05
PIPE_WIDTH, PIPE_CAP_WIDTH, CAP_OVERLAP = .12, .14, .04
BACK_CLOTH_EDGE, PAN_CLOTH_EDGE = .84, .87
BACK_CLOTH_BOTTOM, BACK_CLOTH_TOP = 28.7, 43.25
BACK_PIPE_EDGE, PAN_PIPE_EDGE = .86, .88
BACK_PIPE_TOP, BACK_PIPE_CAPS = 43.65, (28.65, 43.3)
PIPE_FACE_OFFSET, CAP_FACE_OFFSET, PAN_PIPE_RISE = .05, .06, .08
PAN_SKIN = .15
# The back bolsters completely enclose these two piping strips in the final seat.
HIDDEN_PAN_PIPE_ROW = 10
PLATE_CHORDS, PLATE_Z, PLATE_END_HALF = 7, -34.5, .52
PLATES = ((16.1, 3.9, .45, "vinyl_shadow"), (22.8, 4.5, .5, "vinyl_shadow"),
          (23.3, 4.2, .35, "vinyl_satin"))
PLATE_MIN_SQUARE = .1
COLUMN = (-1.65, 16.55, -36.15, 3.3, 6.25, 3.3)
LEVER = (2.8, 23.6, -35.5, 2.4, .22, .3)
HINGE_CHORDS, HINGE_X, HINGE_Y, HINGE_Z = 5, 6.43, 27.8, -29.7
HINGE_RADIUS, HINGE_DEPTH, HINGE_MIN_SQUARE = 1, .20, .04
SPINDLE = (.26, .5, .5)
BELT = (-6.1, 28.13, -32.8, 12.2, .16, 1)
BELT_PIVOT, BELT_YAW = (0, 28.1, -32.3), 7
BUCKLE = (.7, 28.32, -33.3, 1.5, .25, 1.25)
BUCKLE_INSET = (.9, 28.58, -33.05, 1.1, .06, .75)
FACES = ("north", "south", "east", "west", "up", "down")


def half_back(y):
    if y > BACK_SHOULDER_Y:
        return BACK_TOP_HALF + math.sqrt(max(0, BACK_SHOULDER_R ** 2 - (y - BACK_SHOULDER_Y) ** 2))
    if y < BACK_LOWER_Y:
        return BACK_LOWER_HALF + math.sqrt(max(0, BACK_LOWER_R ** 2 - (BACK_LOWER_Y - y) ** 2))
    return BACK_HALF


def back_z(y, s):
    return (BACK_Z + BACK_SLOPE * (y - BACK_BOTTOM)
            - LUMBAR_DEPTH * math.exp(-((y - LUMBAR_Y) / LUMBAR_WIDTH) ** 2)
            - BACK_ROLL_DEPTH * math.exp(-((y - BACK_BOTTOM) / BACK_ROLL_WIDTH) ** 2)
            - SIDE_BOLSTER * s ** 4)


def half_pan(z):
    if z < PAN_FRONT_TANGENT:
        return PAN_CORNER_HALF + math.sqrt(max(0, PAN_CORNER_R ** 2 - (z - PAN_FRONT_TANGENT) ** 2))
    if z > PAN_REAR_TANGENT:
        return PAN_CORNER_HALF + math.sqrt(max(0, PAN_CORNER_R ** 2 - (z - PAN_REAR_TANGENT) ** 2))
    return PAN_HALF


def pan_y(z, s):
    return (PAN_TOP + PAN_BOLSTER * s ** 4 - PAN_DISH * math.sin(math.pi * (z - PAN_FRONT) / PAN_DEPTH)
            - WATERFALL_DEPTH * math.exp(-((z - PAN_FRONT) / WATERFALL_WIDTH) ** 2))


def derivative(function, coordinate, s):
    return (function(coordinate + DERIVATIVE_STEP, s) - function(coordinate - DERIVATIVE_STEP, s)) / (2 * DERIVATIVE_STEP)


def normalize(vector):
    length = math.sqrt(sum(v * v for v in vector))
    return [v / length for v in vector]


class SeatBuilder:
    def __init__(self, registry):
        self.refs = textures.register(registry)
        self.registry = registry
        base = next(r for r in registry.regions() if r.name == "base")
        self.base_ref = kit.regions.RegionRef(registry, base)
        if registry._layout is None:
            kit.regions.pack(registry)

    def face(self, cube, name, rectangle, face):
        u, v, width, height = rectangle
        if face == "south":
            u, width = u + width, -width
        value = {"uv": list(self.refs[name].uv(u, v)), "uv_size": [width, height]}
        cube["uv"][face] = value
        self.registry._layout.bind_face(name, value)
        return cube

    def solid(self, cube, color):
        index = list(textures.COLORS).index(color)
        if index < textures.CLOTH_COLORS:
            name, u = textures.NAME, textures.SWATCH_OFFSET + index
        else:
            name, u = textures.TRIM_NAME, index - textures.CLOTH_COLORS
        for face in FACES:
            self.face(cube, name, (u, 0, 1, 1), face)
        return cube

    def box(self, x, y, z, width, height, depth, color):
        cube = {"origin": [x, y, z], "size": [width, height, depth], "uv": {}}
        if color in textures.COLORS:
            return self.solid(cube, color)
        for face in FACES:
            value = kit.camper_atlas.Atlas.face(kit.ATLAS, color)
            value['uv'] = list(self.base_ref.uv(*value['uv']))
            cube['uv'][face] = value
            self.registry._layout.bind_face('base', value)
        return cube

    def tile(self, center, size, rotation=(0, 0, 0), color="vinyl_mid"):
        cube = self.box(*[c - s / 2 for c, s in zip(center, size)], *size, color)
        cube.update(pivot=list(center), rotation=list(rotation))
        return cube

    def mapped(self, cube, panel, u0, v0, u1, v1, face):
        size = textures.VINYL_SIZE if panel == 'vinyl' else textures.WALE_SIZE
        offset = textures.WALE_SIZE if panel == 'cushion' else 0
        name = textures.VINYL_NAME if panel == 'vinyl' else textures.NAME
        return self.face(cube, name, (offset + u0 * size, v0 * size, (u1 - u0) * size, (v1 - v0) * size), face)

    def seat(self, x):
        cubes = []
        for y, radius, height, color in PLATES:
            for i in range(PLATE_CHORDS):
                depth = 2 * radius / PLATE_CHORDS
                z = -radius + depth * i
                edge = max(abs(z), abs(z + depth))
                half = (radius * PLATE_END_HALF if i in (0, PLATE_CHORDS - 1)
                        else math.sqrt(max(PLATE_MIN_SQUARE, radius * radius - edge * edge)))
                cubes.append(self.box(x - half, y, PLATE_Z + z, 2 * half, height, depth, color))
            if y == PLATES[0][0]:
                dx, yy, zz, w, h, d = COLUMN
                cubes.append(self.box(x + dx, yy, zz, w, h, d, 'vinyl_mid'))
        dx, y, z, w, h, d = LEVER
        cubes.append(self.box(x + dx, y, z, w, h, d, 'steel'))
        row_height = BACK_HEIGHT / BACK_ROWS
        for j in range(BACK_ROWS):
            y = BACK_BOTTOM + (j + .5) * row_height
            half = half_back(y)
            for i in range(COLUMNS):
                s = -1 + (i + .5) * 2 / COLUMNS
                z = back_z(y, s)
                dy = derivative(back_z, y, s)
                dx = -4 * SIDE_BOLSTER * s ** 3 / half
                thickness = BACK_THICKNESS + BACK_CROWN * (1 - s * s) * math.sin(math.pi * (y - BACK_BOTTOM) / BACK_HEIGHT)
                normal, right = normalize((-dx, -dy, 1)), normalize((1, 0, dx))
                up = [normal[1] * right[2] - normal[2] * right[1],
                      normal[2] * right[0] - normal[0] * right[2],
                      normal[0] * right[1] - normal[1] * right[0]]
                matrix = [[right[k], up[k], normal[k]] for k in range(3)]
                center = [v + n * thickness / 2 for v, n in zip((x + s * half, y, z), normal)]
                cube = self.tile(center, (2 * half / COLUMNS * math.sqrt(1 + dx * dx) + BACK_OVERLAP,
                                          row_height * math.sqrt(1 + dy * dy) + BACK_OVERLAP, thickness),
                                 tilt._rotation_of(matrix))
                for face in ('north', 'south'):
                    self.mapped(cube, 'vinyl', i / COLUMNS, j / BACK_ROWS, (i + 1) / COLUMNS, (j + 1) / BACK_ROWS, face)
                if abs(s) < BACK_CLOTH_EDGE and BACK_CLOTH_BOTTOM < y < BACK_CLOTH_TOP:
                    self.mapped(cube, 'back', i / COLUMNS, 1 - (y + row_height / 2 - BACK_BOTTOM) / BACK_HEIGHT,
                                (i + 1) / COLUMNS, 1 - (y - row_height / 2 - BACK_BOTTOM) / BACK_HEIGHT, 'north')
                cubes.append(cube)
            for side in (-1, 1):
                yy = min(BACK_PIPE_TOP, y)
                d = derivative(back_z, yy, BACK_PIPE_EDGE)
                cubes.append(self.tile((x + side * half_back(yy) * BACK_PIPE_EDGE, yy, back_z(yy, side * BACK_PIPE_EDGE) - PIPE_FACE_OFFSET),
                                       (PIPE_WIDTH, row_height * math.sqrt(1 + d * d) + PIPE_OVERLAP, PIPE_WIDTH),
                                       (-math.degrees(math.atan(d)), 0, 0), 'piping'))
        for y in BACK_PIPE_CAPS:
            half = half_back(y) * BACK_PIPE_EDGE
            for i in range(COLUMNS):
                s = -1 + (i + .5) * 2 / COLUMNS
                yaw = math.degrees(math.atan(-4 * SIDE_BOLSTER * (s * BACK_PIPE_EDGE) ** 3 / half_back(y)))
                cubes.append(self.tile((x + s * half, y, back_z(y, s * BACK_PIPE_EDGE) - CAP_FACE_OFFSET),
                                       (2 * half / COLUMNS + CAP_OVERLAP, PIPE_CAP_WIDTH, PIPE_CAP_WIDTH), (0, yaw, 0), 'piping'))
        depth = PAN_DEPTH / PAN_ROWS
        for j in range(PAN_ROWS):
            z = PAN_FRONT + (j + .5) * depth
            half = half_pan(z)
            for i in range(COLUMNS):
                s = -1 + (i + .5) * 2 / COLUMNS
                y = pan_y(z, s)
                dz, dx = derivative(pan_y, z, s), 4 * PAN_BOLSTER * s ** 3 / half
                cube = self.tile((x + s * half, (PAN_BASE + y) / 2, z),
                                 (2 * half / COLUMNS + PAN_OVERLAP, y - PAN_BASE, depth + PAN_OVERLAP))
                for face in ('north', 'south'):
                    self.mapped(cube, 'vinyl', i / COLUMNS, j / PAN_ROWS, (i + 1) / COLUMNS, (j + 1) / PAN_ROWS, face)
                cubes.append(cube)
                cube = self.tile((x + s * half, y, z),
                                 (2 * half / COLUMNS + PAN_OVERLAP, PAN_SKIN, depth * math.sqrt(1 + dz * dz) + PAN_OVERLAP),
                                 (math.degrees(math.atan(dz)), 0, -math.degrees(math.atan(dx))))
                self.mapped(cube, 'vinyl', i / COLUMNS, j / PAN_ROWS, (i + 1) / COLUMNS, (j + 1) / PAN_ROWS, 'up')
                if abs(s) < PAN_CLOTH_EDGE:
                    self.mapped(cube, 'cushion', i / COLUMNS, (z - depth / 2 - PAN_FRONT) / PAN_DEPTH,
                                (i + 1) / COLUMNS, (z + depth / 2 - PAN_FRONT) / PAN_DEPTH, 'up')
                cubes.append(cube)
            for side in (() if j == HIDDEN_PAN_PIPE_ROW else (-1, 1)):
                s = side * PAN_PIPE_EDGE
                cubes.append(self.tile((x + s * half, pan_y(z, s) + PAN_PIPE_RISE, z),
                                       (PIPE_WIDTH, PIPE_WIDTH, depth + PIPE_OVERLAP), color='piping'))
        for side in (-1, 1):
            for k in range(HINGE_CHORDS):
                y = HINGE_Y + (k + .5) * 2 * HINGE_RADIUS / HINGE_CHORDS - HINGE_RADIUS
                dz = math.sqrt(max(HINGE_MIN_SQUARE, HINGE_RADIUS ** 2 - (y - HINGE_Y) ** 2))
                cubes.append(self.box(x + side * HINGE_X - HINGE_DEPTH / 2, y - HINGE_RADIUS / HINGE_CHORDS,
                                      HINGE_Z - dz, HINGE_DEPTH, 2 * HINGE_RADIUS / HINGE_CHORDS, 2 * dz, 'vinyl_shadow'))
            cubes.append(self.tile((x + side * HINGE_X, HINGE_Y, HINGE_Z), SPINDLE, color='chrome'))
        for dimensions, color in ((BELT, 'dark_dash'), (BUCKLE, 'chrome'), (BUCKLE_INSET, 'black')):
            dx, y, z, w, h, d = dimensions
            cube = self.box(x + dx, y, z, w, h, d, color)
            if dimensions == BELT:
                cube.update(rotation=[0, BELT_YAW, 0], pivot=[x + BELT_PIVOT[0], *BELT_PIVOT[1:]])
            cubes.append(cube)
        return cubes


def build_cab_seats(registry) -> AreaCubes:
    builder = SeatBuilder(registry)
    result = AreaCubes()
    for index, x in enumerate(SEAT_CENTERS):
        cubes = builder.seat(x)
        # The curvature equations use game coordinates; undo the generator's final x mirror.
        for cube in cubes:
            cube['origin'][0] = -cube['origin'][0] - cube['size'][0]
            if 'pivot' in cube:
                cube['pivot'][0] *= -1
                cube['rotation'][1] *= -1
        result[f'seat_{index}'] = cubes
    return result


def build():
    return build_cab_seats(kit.REGISTRY)
