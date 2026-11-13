"""Build the camper shower area."""

import math

from tool_loader import load_tool

kit = load_tool("camper_kit")
AreaCubes = kit.AreaCubes
CEIL = kit.CEIL
FLOOR = kit.FLOOR
box = kit.box

AREA = "shower"


SHOWER_HINGE = [8, 0, 54]
# Where the spray leaves: the middle of the underside of the shower head that 2/9 modeled on the
# shower-toilet's rear wall, so the water comes out of the visible head (ADR 0094).
SHOWER_HEAD = [20.5, 44.5, 53.75]


def room_base() -> AreaCubes:
    body = []
    # Shower-toilet room in the rear right corner (cell z = -3, two layers), door to the aisle.
    SHOWER_Z = (40.5, 41.1)  # front partition, behind the window curtain (38 to 40.5)
    body.append(box(8, FLOOR, SHOWER_Z[0], 22.8, CEIL - 0.2, SHOWER_Z[1], "ivory"))
    body.append(box(8, FLOOR, SHOWER_Z[1], 8.6, CEIL - 0.2, 42, "ivory"))  # front jamb
    body.append(box(8, FLOOR, 54, 8.6, CEIL - 0.2, 55.5, "ivory"))  # rear jamb, short of the rear wall
    body.append(box(8, 52, 42, 8.6, CEIL - 0.2, 54, "ivory"))  # header
    body.append(box(9, FLOOR, SHOWER_Z[1], 22.8, FLOOR + 0.3, 55.5, "white"))  # shower tray
    body.append(box(10.5, FLOOR + 0.3, 52, 11.5, FLOOR + 0.35, 53, "black"))  # drain
    body.append(box(14, FLOOR, 45.5, 20, 22, 50.5, "white"))  # toilet bowl
    body.append(box(13, 22, 45, 20, 23, 51, "ivory"))  # seat, 7 px up like the dinette
    body.append(box(19, 23, 45, 19.5, 31, 51, "ivory"))  # raised lid
    body.append(box(19.5, 26, 44.5, 22.6, 34, 51.5, "white"))  # tank
    # The door is its own bone, hinged on its rear edge at the aisle face; it stays closed here.
    shower_door = [box(8, FLOOR + 0.5, 42.1, 8.6, 51.9, 53.9, "wood")]
    shower_door.append(box(7.4, 32, 43, 8, 33, 44.5, "chrome"))  # handle outside
    shower_door.append(box(8.6, 32, 43, 9.2, 33, 44.5, "chrome"))  # handle inside

    return AreaCubes({'body': body, 'shower_door': shower_door})

TILE_PITCH = 1.6
TILE_SCALE = 8
TILE_RISE = 0.035
TILE_INSET = 0.025
ROOM_Y = (16.3, 60.5)
ROOM_X = (8.65, 22.74)
ROOM_Z = (41.15, 55.49)
HEAD_RADIUS = 1.0
HEAD_STRIPS = 32
GRIP_STEPS = 16
HOSE_STEPS = 40
# The rear wheel-well end panel completely encloses these two front-wall tiles.
FRONT_HIDDEN_TILES = frozenset({(7, 0), (8, 0)})
FRONT_TILE_Z = 41.16
HEAD_THICKNESS = 0.13
HEAD_RING_Y = (44.63, 45.11)
HEAD_CAP_THICKNESS = 0.17
HEAD_RING_HALF_WIDTH = 0.104
HEAD_RING_RADII = (0.94, 1.03)
GRIP_ENDS = ((20.0, 45.05, 54.15), (17.2, 42.5, 54.15))
GRIP_RADIUS = (0.32, 0.22)
GRIP_WINDOW_ENDS = ((19.62, 44.71, 53.81), (18.13, 43.35, 53.81))
GRIP_WINDOW_RADIUS = 0.12
GRIP_WINDOW_DEPTH = 0.045
HOSE_START = (16.9, 41.35, 54.15)
HOSE_WIDTH = 2.7
HOSE_DROP = 13.1
HOSE_END_DROP = 3.8
HOSE_RADIUS = 0.08
HOSE_TEXEL_SCALE = 32
HOSE_TEXTURE_STRIDE = 13
HOSE_TEXTURE_WRAP = 230
COLORS = {name: kit.PALETTE[name] for name in ("ivory", "white", "chrome", "steel", "black")}
COLORS["dark"] = kit.PALETTE["grille"]
RegionRegistry = kit.regions.RegionRegistry
RegionRef = kit.regions.RegionRef

def hash_noise(x: float, y: float, seed: int = 0) -> float:
    n = (int(x) * 374761393 + int(y) * 668265263 + seed * 144269) & 0xffffffff
    n = ((n ^ (n >> 13)) * 1274126177) & 0xffffffff
    return ((n ^ (n >> 16)) & 65535) / 32767.5 - 1


def noise(x: float, y: float, seed: int = 0) -> float:
    a, b = math.floor(x), math.floor(y)
    u, v = x - a, y - b
    u, v = u*u*(3-2*u), v*v*(3-2*v)
    return ((1-u)*hash_noise(a,b,seed) + u*hash_noise(a+1,b,seed))*(1-v) + \
        ((1-u)*hash_noise(a,b+1,seed) + u*hash_noise(a+1,b+1,seed))*v


def tinted(base: tuple[int, ...], delta: float) -> tuple[int, int, int, int]:
    return tuple(max(0, min(255, round(c + delta))) for c in base[:3]) + (255,)


def tile_glaze(u: float, v: float) -> tuple[int, int, int, int]:
    cloud = 12*noise(u/.85,v/.92,23) + 6*noise(u/.34,v/.39,24)
    # Warped Voronoi boundaries form the fine non-directional crazed glaze.
    qx = u*1.5 + .16*noise(u*2,v*2,90)
    qy = v*1.5 + .16*noise(u*2,v*2,91)
    ix,iy = math.floor(qx),math.floor(qy)
    ds = sorted(math.hypot(qx-(a+.5+.37*hash_noise(a,b,92)),
                           qy-(b+.5+.37*hash_noise(a,b,93)))
                for a in range(ix-1,ix+2) for b in range(iy-1,iy+2))
    crack = max(0,1-(ds[1]-ds[0])/.12)*11
    return tinted((194,182,149,255),cloud-crack)



def glaze_pixel(x: int, y: int) -> tuple[int, int, int, int]:
    return tile_glaze((x + 0.5) / TILE_SCALE, (y + 0.5) / TILE_SCALE)


def head_pixel(x: int, y: int) -> tuple[int, int, int, int]:
    dx, dy = (x + .5) / 32 - 1, (y + .5) / 32 - 1
    color = COLORS['steel']
    for radius, holes in ((.18, 6), (.38, 12), (.59, 18), (.79, 24)):
        angle = round(math.atan2(dy, dx) / (2 * math.pi) * holes) * 2 * math.pi / holes
        distance = math.hypot(dx - radius * math.cos(angle), dy - radius * math.sin(angle))
        if distance < .034:
            color = COLORS['dark']
        elif distance < .052:
            color = COLORS['chrome']
    return COLORS['ivory'] if math.hypot(dx, dy) > .87 else color


def grip_pixel(x: int, y: int) -> tuple[int, int, int, int]:
    edge = min(x, 15 - x, y, 79 - y)
    return COLORS['ivory'] if edge < 1 else COLORS['steel'] if edge < 3 else COLORS['dark']


def hose_pixel(x: int, y: int) -> tuple[int, int, int, int]:
    return COLORS['steel'] if y % 4 < 2 else COLORS['chrome']


REGIONS = (
    ("shower glaze", 128, 354, kit.regions.Material.TILE, glaze_pixel),
    ("shower head", 64, 64, kit.regions.Material.METAL, head_pixel),
    ("shower grip", 16, 80, kit.regions.Material.METAL, grip_pixel),
    ("shower hose", 16, 256, kit.regions.Material.METAL, hose_pixel),
)


def register_regions(registry: RegionRegistry) -> dict[str, RegionRef]:
    """Register once so independent area builds reuse the final packed references."""
    existing = {r.name: r for r in registry.regions()}
    refs = {}
    for name, width, height, material, pixel in REGIONS:
        region = kit.regions.Region(name, width, height, material, pixel)
        if name in existing:
            refs[name] = RegionRef(registry, existing[name])
        else:
            refs[name] = registry.register(region)
    return refs


def region_face(ref: RegionRef, u: float, v: float, width: float, height: float) -> dict:
    return kit.regions.RegionFace(
        {'uv': list(ref.uv(u, v)), 'uv_size': [width, height]}, ref.region.name)


def box2(x0: float, y0: float, z0: float, x1: float, y1: float, z1: float,
         color: str = 'ivory') -> dict:
    # Keep exact strip dimensions until gen_camper rounds the emitted model.
    return {'origin': [x0, y0, z0], 'size': [x1-x0, y1-y0, z1-z0],
            'uv': {f: kit.ATLAS.face('grille' if color == 'dark' else color)
                   for f in ('north', 'south', 'east', 'west', 'up', 'down')}}

def segment(a: tuple[float, ...], b: tuple[float, ...], r: float, color: str = 'chrome') -> dict:
    dx,dy,dz = [b[i]-a[i] for i in range(3)]
    assert abs(dz)<1e-6
    length = math.hypot(dx,dy)
    cx,cy,cz = [(a[i]+b[i])/2 for i in range(3)]
    c = box2(cx-r,cy-length/2,cz-r,cx+r,cy+length/2,cz+r,color)
    c['pivot']=[cx,cy,cz]
    c['rotation']=[0,0,-math.degrees(math.atan2(dx,dy))]
    return c


def disc(axis: str, cx: float, cy: float, cz: float, r: float, thick: float,
         color: str, steps: int = 12, texture: RegionRef | None = None) -> list[dict]:
    out=[]
    # Circle scan strips avoid a square silhouette or intersecting full slabs.
    for i in range(steps):
        a,b=-r+2*r*i/steps,-r+2*r*(i+1)/steps
        w=math.sqrt(max(0,r*r-((a+b)/2)**2))
        if axis=='y':
            c=box2(cx-w,cy,cz+a,cx+w,cy+thick,cz+b,color)
            if texture:
                c['uv']['down']=region_face(texture, (1-w)*32, (1+a)*32, 2*w*32, (b-a)*32)
        else:
            c=box2(cx-w,cy+a,cz,cx+w,cy+b,cz+thick,color)
        out.append(c)
    if texture is None and steps % 2 == 0:
        middle = steps // 2 - 1
        axis_index = 2 if axis == 'y' else 1
        # Adjacent central scan strips share their width and solid swatch (golden cleanup).
        out[middle]['size'][axis_index] += out[middle + 1]['size'][axis_index]
        del out[middle + 1]
    return out


def add_tiled_wall(out: list[dict], axis: str, at: float, u0: float, u1: float,
                   glaze: RegionRef, y0: float = ROOM_Y[0], y1: float = ROOM_Y[1],
                   hidden: frozenset[tuple[int, int]] = frozenset()) -> None:
    # Real 0.035 px recess: backing stays put, individual glazed faces rise above it.
    for j in range(math.ceil((y1-y0)/TILE_PITCH)):
        for i in range(math.ceil((u1-u0)/TILE_PITCH)):
            if (i, j) in hidden:
                continue
            a,b=u0+i*TILE_PITCH,min(u1,u0+(i+1)*TILE_PITCH)
            c,d=y0+j*TILE_PITCH,min(y1,y0+(j+1)*TILE_PITCH)
            a+=TILE_INSET; b-=TILE_INSET; c+=TILE_INSET; d-=TILE_INSET
            if axis=='z':
                q=box2(a,c,at-TILE_RISE,b,d,at,'ivory'); face='north'
            else:
                q=box2(at-TILE_RISE,c,a,at,d,b,'ivory'); face='west'
            # Map whole faces at exactly 8 texels/model px; all cells retain phase.
            q['uv'][face]=region_face(glaze, (a-u0)*TILE_SCALE, (ROOM_Y[1]-d)*TILE_SCALE,
                                      (b-a)*TILE_SCALE, (d-c)*TILE_SCALE)
            out.append(q)


def build_shower(registry: RegionRegistry) -> AreaCubes:
    """Build against a registry containing base and shower regions, already packed."""
    refs = register_regions(registry)
    room = room_base()
    added: list[dict] = []
    # Thin waterproof liners cover the room-side shell, leaving partition/door boxes intact.
    added += [box2(8.65,16.3,55.49,22.75,60.5,55.53),
              box2(22.74,16.3,41.15,22.78,60.5,55.49)]
    add_tiled_wall(added, 'z', ROOM_Z[1], *ROOM_X, refs['shower glaze'])
    add_tiled_wall(added, 'x', ROOM_X[1], *ROOM_Z, refs['shower glaze'])
    # Front partition's room-facing face is south, so flip the thin raised layer.
    start=len(added)
    add_tiled_wall(added, 'z', FRONT_TILE_Z, *ROOM_X, refs['shower glaze'], hidden=FRONT_HIDDEN_TILES)
    for c in added[start:]:
        c['origin'][2]=FRONT_TILE_Z
        c['uv']['south']=c['uv']['north']
    # Wide head face centered exactly at the original spray locator, underside y=44.5.
    added += disc('y',*SHOWER_HEAD,HEAD_RADIUS,HEAD_THICKNESS,'ivory',HEAD_STRIPS,refs['shower head'])
    hx, _, hz = SHOWER_HEAD
    for i in range(HEAD_STRIPS):
        a=2*math.pi*i/HEAD_STRIPS
        c=box2(hx-HEAD_RING_HALF_WIDTH,HEAD_RING_Y[0],hz+HEAD_RING_RADII[0],
               hx+HEAD_RING_HALF_WIDTH,HEAD_RING_Y[1],hz+HEAD_RING_RADII[1],'ivory')
        c['pivot']=[hx,HEAD_RING_Y[0],hz]
        c['rotation']=[0,-math.degrees(a),0]
        added.append(c)
    added += disc('y',hx,HEAD_RING_Y[1],hz,HEAD_RADIUS,HEAD_CAP_THICKNESS,'white',HEAD_STRIPS)
    # Tapered diagonal grip: the photo's side recess faces the room (-z).
    a,b=GRIP_ENDS
    for i in range(GRIP_STEPS):
        t0,t1=i/GRIP_STEPS,(i+1)/GRIP_STEPS
        p=tuple(a[k]+(b[k]-a[k])*t0 for k in range(3))
        q=tuple(a[k]+(b[k]-a[k])*t1 for k in range(3))
        added.append(segment(p,q,GRIP_RADIUS[0]+(GRIP_RADIUS[1]-GRIP_RADIUS[0])*t0,'ivory'))
    window=segment(*GRIP_WINDOW_ENDS,GRIP_WINDOW_RADIUS,'dark')
    window['size'][2]=GRIP_WINDOW_DEPTH
    window['uv']['north']=region_face(refs['shower grip'], 0, 0, 16, 80)
    added.append(window)
    added += disc('z',17.2,42.4,55.30,.77,.17,'dark',24)
    # Two screw heads on the round plate, with genuine slots.
    for x,y in ((16.78,42.73),(17.62,42.07)):
        added += disc('z',x,y,55.24,.11,.065,'chrome',4)
        added.append(box2(x-.075,y-.018,55.225,x+.075,y+.018,55.24,'dark'))
    added.append(box2(16.93,42.15,54.4,17.47,42.65,55.3,'chrome'))
    added += disc('z',17.2,42.4,54.03,.37,.45,'chrome',8)
    added.append(segment((17.2,42.5,54.15),(16.9,41.8,54.15),.25,'ivory'))
    added.append(box2(16.65,41.35,53.9,17.15,41.85,54.4,'chrome'))
    # U-shaped flexible hose, kept behind the toilet and away from the doorway.
    pts=[]
    for i in range(HOSE_STEPS + 1):
        t=i/HOSE_STEPS
        pts.append((HOSE_START[0]+HOSE_WIDTH*t,
                    HOSE_START[1]-HOSE_DROP*math.sin(math.pi*t)-HOSE_END_DROP*t,HOSE_START[2]))
    for i,(a,b) in enumerate(zip(pts,pts[1:])):
        c=segment(a,b,HOSE_RADIUS,'steel')
        for f in ('north','south','east','west'):
            c['uv'][f]=region_face(refs['shower hose'], 0, (i*HOSE_TEXTURE_STRIDE)%HOSE_TEXTURE_WRAP, 16, math.dist(a,b)*HOSE_TEXEL_SCALE)
        added.append(c)
    added.append(box2(19.35,37.25,53.9,19.85,37.75,54.4,'chrome'))
    room['body'].extend(added)
    if registry is not kit.REGISTRY:
        source = kit.LAYOUT.origin('base')
        target = registry._layout.origin('base')
        for cubes in room.values():
            for cube in cubes:
                for face in cube['uv'].values():
                    if face.region == 'base':
                        face['uv'] = [value - old + new for value, old, new
                                      in zip(face['uv'], source, target)]
    return room


def build() -> AreaCubes:
    kit.prepare_layout()
    return build_shower(kit.REGISTRY)
