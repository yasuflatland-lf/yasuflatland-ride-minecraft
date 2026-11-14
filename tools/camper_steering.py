"""Build the approved camper wheel, firewall column and static shift lever."""

import math
from typing import TYPE_CHECKING
from tool_loader import load_tool

if TYPE_CHECKING:
    from camper_dash import DashGeometry
    from camper_kit import AreaCubes
    from camper_regions import RegionRegistry

Cube = dict
Point = tuple[float, float, float]
AREA = "steering"
APPROVED_SCALE = .8
SOURCE_RADIUS = 7.2
SOURCE_DIAMETER = 14.4
TRACE_DIAMETER = 14.8
TRACE_SCALE = TRACE_DIAMETER / SOURCE_DIAMETER
WHEEL_LEAN = 60.0
_DASH = load_tool("camper_dash")
# The hub moved with the whole dash, column and wheel group toward the driver.
HUB_X, HUB_Y, HUB_Z = _DASH.COLUMN_HUB[0], _DASH.COLUMN_HUB[1], _DASH.COLUMN_HUB[2] + _DASH.DASH_SHIFT
HUB_RECESS = 3.8
AXIS = (0, math.sqrt(3) / 2, .5)
STEERING_PIVOT = tuple((HUB_X, HUB_Y, HUB_Z)[i] + HUB_RECESS * AXIS[i] for i in range(3))
RIM_SEGMENTS = 32
RIM_WIDTH = .9
ARC_OVERLAP = 1.1
GRIP_COUNT = 36
GRIP_PHASE = 5
SOURCE_PRECISION = 3
GRIP_INSET = .55
GRIP_SIZE = (.36, .4, .6)
GRIP_SPOKE_GAP = 15
HORN_RADIUS = SOURCE_RADIUS - 2.2
HORN_WIDTH = .35
HORN_SEGMENTS = 16
HUB_SCALE = .65
HUB_TRACE_RECESS = 4.3
HUB_PROFILES = ((2.2, -.6, 1.2, 16, 'hub'), (1.6, .6, .4, 8, 'chrome'), (1.25, 1., .3, 8, 'black'))
SPOKE_ANGLES = (0, 90, 180)
SPOKE_REACH = 7.7
SPOKE_WIDTH = .32
FIREWALL_AXIS_INSET = .9
COLUMN_WIDTH = .5
COLUMN_SLEEVE_WIDTH = 1.
COLUMN_SLEEVE_LENGTH = 3.
LEVER_ATTACHMENT = (-14.29, 34., -45.4)
LEVER_PHOTO_BEND = (-11.65, 34., -46.1)
LEVER_PHOTO_TIP = (-12.4, 36.8, -49.8)
LEVER_SCALE = 2.
LEVER_RISE_SCALE = .5
LEVER_ELEVATION = math.degrees(math.atan2(LEVER_PHOTO_TIP[1]-LEVER_PHOTO_BEND[1], math.hypot(LEVER_PHOTO_TIP[0]-LEVER_PHOTO_BEND[0], LEVER_PHOTO_TIP[2]-LEVER_PHOTO_BEND[2])))
LEVER_WIDTH = .12
CYLINDER_TURNS = (0, 45, 90, 135)
OCTAGON_SHORT = .414214
HANDLE_PROFILES = ((-.04,.09,.105,.105,'steel',1),(.07,.68,.15,.22,'black',3),(.68,.79,.22,.18,'black',1),(.79,.87,.18,.11,'black',1),(.87,.90,.11,.035,'black',1))
WHEEL_CUBES = 112
ASSEMBLIES = {"steering_wheel": {"owner": "camper", "cubes": 114},
              "steering_spokes": {"owner": "camper", "cubes": 3},
              "steering_lever": {"owner": "camper", "cubes": 30}}


def vector(a: Point, b: Point) -> Point:
    return tuple(b[i] - a[i] for i in range(3))


def along(a: Point, direction: Point, distance: float) -> Point:
    return tuple(a[i] + direction[i] * distance for i in range(3))


class SteeringBuilder:
    def __init__(self, registry: 'RegionRegistry') -> None:
        self.kit = load_tool('camper_kit')
        regions = load_tool('camper_regions')
        if registry is self.kit.REGISTRY:
            self.kit.prepare_layout()
        elif registry._layout is None:
            regions.pack(registry)
        self.refs = {r.name: regions.RegionRef(registry, r) for r in registry.regions()}

    def box(self, origin: Point, size: Point, color: str, pivot: Point | None=None,
            rotation: Point | None=None) -> Cube:
        uv = self.refs['base'].uv(self.kit.SLOTS.index(color), 0)
        c = dict(origin=list(origin), size=list(size),
                 uv={f:dict(uv=list(uv), uv_size=[1,1]) for f in ('north','south','east','west','up','down')})
        if rotation is not None:
            c.update(pivot=list(pivot), rotation=list(rotation))
        return c

    def wheel(self) -> list[Cube]:
        out = []
        def source(center: Point, size: Point, color: str, angle: float) -> Cube:
            # The source pack rounded box extents before mirroring and serializing pivots.
            origin = [round(center[i]-size[i]/2, SOURCE_PRECISION) for i in range(3)]
            size = [round(v, SOURCE_PRECISION) for v in size]
            origin[0] = round(-origin[0]-size[0], SOURCE_PRECISION)
            pivot = [round(-center[0], SOURCE_PRECISION), round(center[1], SOURCE_PRECISION), round(center[2], SOURCE_PRECISION)]
            return self.box(origin, size, color, pivot, (0,0,angle))
        def arc(radius: float, width: float, color: str, start: float, stop: float, count: int) -> None:
            span = math.radians(stop-start)
            length = abs(span)*radius/count*ARC_OVERLAP
            for i in range(count):
                angle = math.radians(start)+span*(i+.5)/count
                out.append(source((radius*math.cos(angle),radius*math.sin(angle),0),
                                  (length,width,width),color,math.degrees(angle)+90))
        arc(SOURCE_RADIUS,RIM_WIDTH,'ivory',0,360,RIM_SEGMENTS)
        for i in range(GRIP_COUNT):
            angle = i*360/GRIP_COUNT+GRIP_PHASE
            if min(angle % 180,180-angle % 180)<GRIP_SPOKE_GAP:
                continue
            a = math.radians(angle)
            radius = SOURCE_RADIUS-GRIP_INSET
            out.append(source((radius*math.cos(a),radius*math.sin(a),0),GRIP_SIZE,'ivory',angle+90))
        arc(HORN_RADIUS,HORN_WIDTH,'chrome',180,360,HORN_SEGMENTS)
        rim_and_horn = out[:]
        for radius,z,depth,steps,color in HUB_PROFILES:
            size = (2*radius,2*radius*math.tan(math.pi/(2*steps)),depth)
            for i in range(steps):
                c = source((0,0,z+depth/2),size,color,i*180/steps)
                c['pivot'][2] = z
                for key in ('origin','pivot'):
                    for j in (0,1): c[key][j] *= TRACE_SCALE*HUB_SCALE
                    c[key][2] -= HUB_TRACE_RECESS
                for j in (0,1): c['size'][j] *= TRACE_SCALE*HUB_SCALE
                out.append(c)
        for c in rim_and_horn:
            for key in ('origin','pivot'):
                for j in (0,1): c[key][j] *= TRACE_SCALE
            for j in (0,1): c['size'][j] *= TRACE_SCALE
        for angle in SPOKE_ANGLES:
            a = math.radians(angle)
            end = (SPOKE_REACH*math.cos(a),SPOKE_REACH*math.sin(a),0)
            start = (0,0,-HUB_RECESS)
            out.append(self.rod(start,end,SPOKE_WIDTH,'chrome'))
        # shrink17 scales about the physical hub in wheel-local space, not the rim centre.
        center = (0,0,-HUB_RECESS)
        for c in out:
            for key in ('origin','pivot'):
                c[key] = [STEERING_PIVOT[j]+center[j]+APPROVED_SCALE*(c[key][j]-center[j]) for j in range(3)]
            c['size'] = [v*APPROVED_SCALE for v in c['size']]
        return out

    def rod(self, a: Point, b: Point, width: float, color: str, lacquer: bool=False) -> Cube:
        delta = vector(a,b)
        length = math.dist(a,b)
        c = self.box((a[0],a[1]-width/2,a[2]-width/2),(length,width,width),color,a,
                     (0,math.degrees(math.asin(-delta[2]/length)),-math.degrees(math.atan2(delta[1],delta[0]))))
        if lacquer:
            for f in c['uv']:
                c['uv'][f] = dict(uv=list(self.refs['cab DARK19'].uv(1,0)),uv_size=[-1,1])
        return c

    def lever(self, offset: Point) -> list[Cube]:
        a = LEVER_ATTACHMENT
        bend = along(a,vector(a,LEVER_PHOTO_BEND),LEVER_SCALE)
        raw = along(a,vector(a,LEVER_PHOTO_TIP),LEVER_SCALE)
        raw = along(bend,vector(bend,raw),LEVER_RISE_SCALE)
        length = math.dist(bend,raw)
        horizontal = vector(bend,(raw[0],bend[1],raw[2]))
        horizontal = tuple(v/math.hypot(horizontal[0],horizontal[2]) for v in horizontal)
        elevation = math.radians(LEVER_ELEVATION)
        direction = (horizontal[0]*math.cos(elevation),math.sin(elevation),horizontal[2]*math.cos(elevation))
        tip = along(bend,direction,length)
        cubes = [self.rod(a,bend,LEVER_WIDTH*LEVER_SCALE,'steel',True),self.rod(bend,tip,LEVER_WIDTH*LEVER_SCALE,'steel',True)]
        for start,end,r0,r1,color,slices in HANDLE_PROFILES:
            lo,hi = along(tip,direction,start*LEVER_SCALE),along(tip,direction,end*LEVER_SCALE)
            for i in range(slices):
                radius = LEVER_SCALE*(r0+(r1-r0)*(i+.5)/slices)
                station = along(lo,vector(lo,hi),i/slices)
                stop = along(lo,vector(lo,hi),(i+1)/slices)
                for angle in CYLINDER_TURNS:
                    c = self.rod(station,stop,2*radius,color,color=='steel')
                    c['size'][2] = 2*radius*OCTAGON_SHORT
                    c['origin'][2] = station[2]-radius*OCTAGON_SHORT
                    c['rotation'][0] = -angle
                    cubes.append(c)
        return [self.kit.moved(c,offset) for c in cubes]


def build_steering(dash: 'DashGeometry', registry: 'RegionRegistry') -> 'AreaCubes':
    b = SteeringBuilder(registry)
    # column_entry is the fascia/axis intersection; the shaft continues to the firewall.
    hub = (-dash.column_entry[0],HUB_Y,dash.column_entry[2]+(HUB_Y-dash.column_entry[1])/math.sqrt(3))
    offset = (hub[0]-HUB_X,0,hub[2]-HUB_Z)
    wheel = [b.kit.moved(c,offset) for c in b.wheel()]
    dash_module = load_tool('camper_dash')
    constant = dash_module.FRONT_WALL_Z+abs(hub[0])*math.tan(math.radians(dash_module.FRONT_YAW))+dash_module.FRONT_SLOPE*dash_module.FRONT_WALL_Y+FIREWALL_AXIS_INSET+dash_module.DASH_SHIFT+offset[2]
    ey = (constant-hub[2]+hub[1]/math.sqrt(3))/(1/math.sqrt(3)+dash_module.FRONT_SLOPE)
    entry = (hub[0],ey,hub[2]+(ey-hub[1])/math.sqrt(3))
    column = [b.rod(entry,hub,COLUMN_WIDTH,'dark_dash'),b.rod(entry,along(entry,AXIS,COLUMN_SLEEVE_LENGTH),COLUMN_SLEEVE_WIDTH,'steel')]
    lever = b.lever(offset)
    tilt = load_tool('cube_tilt').tilt_assembly
    members = tilt(wheel[:WHEEL_CUBES]+column,(0,0,0),'x',0,assembly='steering_wheel',assemblies=ASSEMBLIES)
    wheel = members[:WHEEL_CUBES]+tilt(wheel[WHEEL_CUBES:],(0,0,0),'x',0,assembly='steering_spokes',assemblies=ASSEMBLIES)
    column = members[WHEEL_CUBES:]
    lever = tilt(lever,(0,0,0),'x',0,assembly='steering_lever',assemblies=ASSEMBLIES)
    def build_frame(c: Cube) -> Cube:
        c['origin'][0] = -c['origin'][0]-c['size'][0]
        c['pivot'][0] = -c['pivot'][0]
        c['rotation'][1] = -c['rotation'][1]
        c['uv']['east'],c['uv']['west'] = c['uv']['west'],c['uv']['east']
        return c
    return b.kit.AreaCubes({'steering':[build_frame(c) for c in wheel],
                            'body':[build_frame(c) for c in column+lever]})


def build() -> 'AreaCubes':
    return build_steering(load_tool('camper_dash').DASH_GEOMETRY,load_tool('camper_kit').REGISTRY)
