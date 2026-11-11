"""Generate the photo-reference Toilet in pixels (ADR 0246).

Photo units are scaled by 0.775. Reflect x before writing because Bedrock mirrors
model x; the lever must appear on the game's -x side in the photo review views.
"""
import argparse
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tool_loader import load_tool

panels = load_tool("panels")
tilt = load_tool("cube_tilt")
texture_io = load_tool("texture_io")
SCALE = 0.775
ATLAS_SIZE = 512
TILE = 128
PLATE_GUTTER = 1
DECIMALS = 4
GEOMETRY = "models/entity/yasu_ride/toilet.geo.json"
TEXTURE = "textures/entity/yasu_ride/toilet.png"
HINGE = (0, 11.6 * SCALE, 2.2 * SCALE)
SEAT_TOP = 10.4 * SCALE
PORCELAIN = (245, 247, 247)
INNER = (230, 236, 238)
WHITE = (255, 255, 255)
WATER = (158, 220, 255)
CHROME = [(0, (139, 148, 154)), (.22, (221, 227, 230)), (.42, WHITE),
          (.58, (170, 179, 185)), (.8, (227, 232, 235)), (1, (125, 135, 141))]


def shape(a, zf, zb, nf=2.4, nb=2.4):
    return dict(a=a, zf=zf, zb=zb, nf=nf, nb=nb)


BODY = [(0, shape(2.54, -5.09, 7.9, 2.2, 4)),
        (1, shape(3.18, -6.05, 8.2, 2.2, 4)),
        (1.8, shape(3.5, -6.91, 8.25, 2.2, 4)),
        (3.4, shape(3.82, -7.87, 8.3, 2.3, 4)),
        (5.9, shape(4.03, -8.54, 8.3, 2.3, 4)),
        (8.3, shape(4.13, -8.83, 8.3, 2.3, 4)),
        (9.6, shape(4.13, -8.93, 8.3, 2.3, 4))]
HOLE = shape(2.44, -7.68, -.3, 2.2, 2.2)
INTERIOR = [(5, shape(1.59, -5.57, -1.6)), (6.2, shape(2.12, -6.72, -.8)),
            (7.8, shape(2.39, -7.39, -.5)), (9.6, HOLE), (10.4, HOLE)]
SEAT = BODY[-1][1]
SHELF = shape(4.2, 4, 9.2, 3, 3)
TANK = [(10.4, shape(3.9, 5, 8.8)), (11.6, shape(4.4, 4.6, 9.2, 2.6, 2.6)),
        (20.7, shape(4.45, 4.54, 9.28, 2.6, 2.6))]
CAP = [(20.7, shape(4.7, 4.2, 9.4, 2.6, 2.6)),
       (20.9, shape(4.8, 4.05, 9.35, 2.6, 2.6)),
       (21.5, shape(4.78, 4.05, 9.35, 2.6, 2.6)),
       (21.9, shape(4.3, 4.5, 8.9, 2.6, 2.6))]
LID = [(10.4, shape(4.08, -8.93, 2.2, 2.3, 3)),
       (11, shape(4.16, -9.02, 2.3, 2.3, 3)),
       (11.6, shape(4, -8.85, 2.1, 2.3, 3))]
POOL = shape(1.4, -5.6, -1.8)
# Each plate owns a tile so transparent texels retain the adjacent opaque RGB.
PLATES = [(BODY[0][1], None, WHITE, 255), (INTERIOR[0][1], None, INNER, 255),
          (SEAT, HOLE, WHITE, 255), (SHELF, None, WHITE, 255),
          (CAP[-1][1], None, WHITE, 255), (LID[-1][1], None, WHITE, 255),
          (LID[0][1], None, WHITE, 255), (POOL, None, WATER, 153)]
SWATCHES = {"porcelain": 8, "inner": 9, "foam": 10, "dark": 11, "chrome": 12, "disc": 13}
SWIRL_COUNT, JET_COUNT = 16, 6
LOFT_COUNTS = {"body": 108, "interior": 72, "seat": 18, "shelf": 18,
               "tank": 32, "cap": 48, "lid": 36}
ASSEMBLIES = {name: {"owner": "gen_toilet", "cubes": count} for name, count in LOFT_COUNTS.items()}


def face(tile, hidden=False):
    return {"uv": [(tile % 4) * TILE, (tile // 4) * TILE],
            "uv_size": [1, 1] if hidden else [TILE, TILE]}


HIDDEN = face(15, True)


def box(a, b, material="porcelain"):
    return panels.panel(*[v * SCALE for v in (-b[0], a[1], a[2], -a[0], b[1], b[2])],
                        face(SWATCHES[material]))


def ring(y, s, count):
    points = []
    for i in range(count):
        c, sn = math.cos(i * math.tau / count), math.sin(i * math.tau / count)
        n = s['nf'] if sn < 0 else s['nb']
        signed = lambda v: math.copysign(abs(v) ** (2 / n), v)
        points.append((s['a'] * signed(c), y,
                       (s['zf'] + s['zb']) / 2 + (s['zb'] - s['zf']) / 2 * signed(sn)))
    return points


def sub(a, b):
    return [x - y for x, y in zip(a, b)]


def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def norm(v):
    length = math.sqrt(dot(v, v))
    return [x / length for x in v]


def loft(rings, count=18, thick=.4, material="porcelain", inward=False):
    parts = []
    rows = [ring(y, s, count) for y, s in rings]
    for a, b in zip(rows, rows[1:]):
        centre = [sum(p[k] for p in a) / count for k in range(3)]
        for i in range(count):
            a0, a1, b0, b1 = a[i], a[(i+1) % count], b[i], b[(i+1) % count]
            u = [(x+y)/2 for x, y in zip(sub(a1, a0), sub(b1, b0))]
            v = [(x+y)/2 for x, y in zip(sub(b0, a0), sub(b1, a1))]
            c = [sum(p[k] for p in (a0, a1, b0, b1))/4 for k in range(3)]
            ex = norm(u)
            vp = [v[k] - ex[k]*dot(v, ex) for k in range(3)]
            ey = norm(vp)
            ez = [ex[1]*ey[2]-ex[2]*ey[1], ex[2]*ey[0]-ex[0]*ey[2], ex[0]*ey[1]-ex[1]*ey[0]]
            outward = [c[0]-centre[0], 0, c[2]-centre[2]]
            if dot(ez, outward) * (-1 if inward else 1) < 0:
                ey, ez = [-x for x in ey], [-x for x in ez]
            size = [math.sqrt(dot(u, u))+min(.16, thick*.4),
                    math.sqrt(dot(vp, vp))+min(.16, thick*.6), thick]
            pos = [(c[k]-ez[k]*thick/2)*SCALE for k in range(3)]
            rot = tilt.rotation_of([[ex[k], ey[k], ez[k]] for k in range(3)])
            # Reflect both the world and the local x axis to preserve handedness.
            pos[0] *= -1
            rot[1] = -rot[1]
            size = [x*SCALE for x in size]
            part = rounded(panels.panel(*[pos[k]-size[k]/2 for k in range(3)],
                                        *[pos[k]+size[k]/2 for k in range(3)],
                                        face(SWATCHES[material]), pos, rot))
            # Reference panels overlap their joins; only the bottom seam may extend below the floor.
            # The lift is rounded up so the written, rounded panel still clears the floor.
            low = tilt.bounds([part])[0][1]
            if low < 0:
                lift = math.ceil(-low * 10**DECIMALS) / 10**DECIMALS
                part['origin'][1] = round(part['origin'][1] + lift, DECIMALS)
                part['pivot'][1] = round(part['pivot'][1] + lift, DECIMALS)
            parts.append(part)
    return parts


def plate(tile, y0, y1, bottom=False):
    s = PLATES[tile][0]
    part = box((-s['a'], y0, s['zf']), (s['a'], y1, s['zb']))
    part['uv'] = {side: HIDDEN for side in panels.CUBE_SIDES}
    part['uv']['down' if bottom else 'up'] = {
        'uv': [(tile % 4)*TILE+PLATE_GUTTER, (tile // 4)*TILE+PLATE_GUTTER],
        'uv_size': [TILE-2*PLATE_GUTTER, TILE-2*PLATE_GUTTER]}
    return part


def geometry():
    bones = [{"name": "root", "pivot": [0, 0, 0]}]
    groups = {}
    def add(name, parts, parent="root", pivot=(0, 0, 0)):
        bones.append(dict(name=name, parent=parent, pivot=list(pivot), cubes=parts))
    for name, rings, count, thick, material, inward in [
            ('body', BODY, 18, .5, 'porcelain', False),
            ('interior', INTERIOR, 18, .3, 'inner', True),
            ('seat', [(9.6, SEAT), (10.4, SEAT)], 18, .4, 'porcelain', False),
            ('shelf', [(9.8, SHELF), (10.4, SHELF)], 18, .3, 'porcelain', False),
            ('tank', TANK, 16, .5, 'porcelain', False),
            ('cap', CAP, 16, .4, 'porcelain', False),
            ('lid', LID, 18, .4, 'porcelain', False)]:
        parts = loft(rings, count, thick, material, inward)
        groups[name] = parts[:]
        plates = {'body': [plate(0, 0, .2)], 'interior': [plate(1, 4.8, 5)],
                  'seat': [plate(2, 10.3, 10.4)], 'shelf': [plate(3, 10.3, 10.4)],
                  'cap': [plate(4, 21.75, 21.9)],
                  'lid': [plate(5, 11.5, 11.6), plate(6, 10.4, 10.5, True)]}
        add(name, parts + plates.get(name, []), pivot=HINGE if name == 'lid' else (0, 0, 0))
    lever = [box((-4.95, 18.25, 6.35), (-4.45, 19.35, 7.45), 'chrome'),
             box((-5.7, 18.6, 6.64), (-4.95, 19.04, 7.16), 'chrome')]
    disc = box((-5.07, 18.15, 6.25), (-4.93, 19.45, 7.55))
    disc['uv'] = {side: HIDDEN for side in panels.CUBE_SIDES}
    disc['uv']['east'] = face(SWATCHES['disc'])
    lever.append(disc)
    for a, b in [((-.27, -.75, -.44), (.27, .24, .44)),
                 ((-.27, -1.35, -.36), (.27, -.75, .36)),
                 ((-.23, -1.85, -.28), (.23, -1.35, .28))]:
        part = box(tuple(a[k] + (-5.65, 18.8, 6.9)[k] for k in range(3)),
                   tuple(b[k] + (-5.65, 18.8, 6.9)[k] for k in range(3)), 'chrome')
        part.update(pivot=[5.65*SCALE, 18.8*SCALE, 6.9*SCALE], rotation=[0, 0, -math.degrees(.15)])
        lever.append(part)
    add('lever', lever)
    add('drain', [box((-.9, 5, -6.4), (.9, 5.05, -5.5), 'dark')])
    for group, count, size, prefix in [('swirl', SWIRL_COUNT, (.7, .3, .7), 'swirl'),
                                       ('rim_jets', JET_COUNT, (.3, .3, 1.4), 'rim_jet')]:
        add(group, [])
        for i in range(count):
            add(f'{prefix}_{i}', [box(tuple(-v/2 for v in size), tuple(v/2 for v in size), 'foam')], group)
    # ADR 0246 requires water to follow all opaque bones for alpha ordering.
    add('water', [plate(7, 5.1, 5.25)], pivot=(0, 5.1*SCALE, 0))
    all_parts = [c for b in bones for c in b.get('cubes', [])]
    tilt.assert_axes(all_parts, groups, ASSEMBLIES)
    return {"format_version": "1.12.0", "minecraft:geometry": [{
        "description": {"identifier": "geometry.yasu_ride.toilet", "texture_width": ATLAS_SIZE,
                        "texture_height": ATLAS_SIZE, "visible_bounds_width": 2,
                        "visible_bounds_height": 2, "visible_bounds_offset": [0, 1, 0]},
        "bones": rounded(bones)}]}


def rounded(value):
    # libm's sin, cos and pow may differ in the last bit between the Mac and the Linux CI
    # runner, so full-precision floats would make `pnpm model:check` fail there.
    if isinstance(value, float):
        return round(value, DECIMALS) + 0.0
    if isinstance(value, list):
        return [rounded(v) for v in value]
    if isinstance(value, dict):
        return {k: rounded(v) for k, v in value.items()}
    return value


def inside(s, x, z):
    t = (z-(s['zf']+s['zb'])/2)/((s['zb']-s['zf'])/2)
    n = s['nf'] if t < 0 else s['nb']
    return abs(t) < 1 and abs(x)/s['a'] <= (1-abs(t)**n)**(1/n)


def gradient(stops, t):
    for (a, ca), (b, cb) in zip(stops, stops[1:]):
        if t <= b:
            return tuple(round(x+(y-x)*(t-a)/(b-a)) for x, y in zip(ca, cb))
    return stops[-1][1]


def disc_color(x, y):
    dx, dy = (x + .5) / TILE - .5, (y + .5) / TILE - .5
    ox, oy, r0, radius = -18/128, -22/128, 4/128, 60/128
    vx, vy = dx-ox, dy-oy
    aa = ox*ox+oy*oy-(radius-r0)**2
    bb = 2*(vx*ox+vy*oy-r0*(radius-r0))
    cc = vx*vx+vy*vy-r0*r0
    t = max(0, min(1, (-bb-math.sqrt(max(0, bb*bb-4*aa*cc)))/(2*aa)))
    return gradient([(0, WHITE), (.5, (198, 204, 208)),
                     (.85, (125, 134, 139)), (1, (61, 66, 70))], t)


def padded_disc(x, y):
    if (x + .5 - 64)**2 + (y + .5 - 64)**2 <= 61**2:
        return (*disc_color(x, y), 255)
    # Extend the nearest opaque texel, rather than the canvas' transparent black,
    # to prevent filtering fringes around the chrome boss (ADR 0246).
    nearest, distance = None, math.inf
    for row in range(3, 125):
        square = 61**2 - (row + .5 - 64)**2
        if square < 0:
            continue
        reach = math.sqrt(square)
        low, high = math.ceil(63.5 - reach), math.floor(63.5 + reach)
        col = max(low, min(high, x))
        candidate = (col - x)**2 + (row - y)**2
        if candidate < distance:
            nearest, distance = (col, row), candidate
    return (*disc_color(*nearest), 0)


def pixel(x, y):
    tile = x//TILE + 4*(y//TILE)
    u, v = ((x % TILE)+.5)/TILE, ((y % TILE)+.5)/TILE
    if tile < len(PLATES):
        s, hole, rgb, alpha = PLATES[tile]
        pu, pv = [((value % TILE)+.5-PLATE_GUTTER)/(TILE-2*PLATE_GUTTER) for value in (x, y)]
        px, pz = (pu*2-1)*s['a'], s['zb']-pv*(s['zb']-s['zf'])
        return (*rgb, alpha if inside(s, px, pz) and not (hole and inside(hole, px, pz)) else 0)
    if tile == 12:
        rgb = gradient(CHROME, u)
        overlay = .35*(1-2*v) if v < .5 else -.25*(2*v-1)
        return (*[round(c+(255-c)*overlay) if overlay >= 0 else round(c*(1+overlay)) for c in rgb], 255)
    if tile == 13:
        return padded_disc(x % TILE, y % TILE)
    rgb = {8: PORCELAIN, 9: INNER, 10: WHITE, 11: (38, 41, 44)}.get(tile, WHITE)
    return (*rgb, 255 if tile < 14 else 0)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('resource_pack', type=Path)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    out = texture_io.Outputs(args.check, report_writes=True)
    out.json(args.resource_pack / GEOMETRY, geometry())
    out.png(args.resource_pack / TEXTURE, ATLAS_SIZE, ATLAS_SIZE, pixel)
    out.finish('Toilet outputs are stale; run `pnpm model`:', 'Toilet model and texture are up to date')


if __name__ == '__main__':
    main()
