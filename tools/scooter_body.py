"""Pressed scooter body in the spike frame (+x is the rider's right)."""

import copy
import math
from functools import cache

from tool_loader import load_tool

D = load_tool("scooter_dims")
kit = load_tool("scooter_kit")
atlas = load_tool("scooter_atlas")
tilt = load_tool("cube_tilt")
AREA = "body"

# Side-photo control points from the frozen scooter spike, before perspective correction.
COWL_OUTLINE = ((48,415),(65,392),(80,367),(100,344),(125,324),(150,310),
    (175,301),(200,297),(223,297),(248,301),(270,309),(290,321),(305,337),
    (315,360),(321,382),(317,403),(308,421),(294,438),(279,442),(250,443),
    (190,440),(130,434),(87,425))
COWL_WIDTH = ((48,2.05),(95,3.35),(145,3.96),(205,4.1),(260,3.9),
              (300,3.2),(312,2.65),(323,2.22))
COWL_BASE = ((48,1.58),(95,1.95),(145,2.25),(205,2.42),(260,2.5),(323,2.15))
COWL_STATIONS = (48.2,54,65,82,105,130,155,180,205,230,255,278,296,309,317,320.8)
COWL_CROSS = ((0,1,0,0),(.15,.28,.72,0),(.4,0,1,.12),
              (.65,0,1,.5),(.84,0,1,.48),(.94,0,1,.35),(1,0,1,.3))
COWL_SECTIONS = (0,.07,.15,.25,.4,.55,.68,.8,.89,.95,1)
JOINT_ROUTE = ((48.4,.025),(65,.025),(80,.025),(100,.025),(125,.025),
    (150,.025),(175,.025),(200,.025),(223,.025),(248,.025),(270,.025),
    (290,.025),(305,.025),(315,.045),(318.8,.13),(320.6,.29),(320.7,.46),
    (319.2,.65),(315,.8),(305,.9),(293,.98))
VENTS = ((154,221,371),(149,224,379.4),(146,225,388),(144,225,396.6),
         (144,223,405.4),(145,221,414.2),(148,218,423))
FRAME_FRONT = ((262,397),(279,380),(297,363),(319,348),(345,340),
               (370,341),(393,350),(413,369),(428,397))
FRAME_REAR = ((262,165),(270,164),(279,156),(297,128),(319,105),
              (345,88),(370,74),(393,61),(413,50),(428,95))
SEAT_OUTLINE = ((165,267),(165,240),(170,224),(180,214),(193,216),
    (212,226),(260,231),(310,230),(354,226),(386,220),(393,229),(397,242),
    (391,251),(360,258),(280,265),(200,269))
SEAT_WIDTH = ((165,1.86),(170,2.2),(182,2.32),(240,2.32),(270,2.26),
              (310,1.83),(350,1.31),(382,.9),(392,.82),(396,.74),(397,.65))
TUNNEL_EXTENSION = ((0,5.6,2.1,.8),(-2.3,5.6,1.85,.8),(-4.25,5.95,1.6,.9),
    (-5.45,6.95,1.35,1),(-6.35,8.65,1.15,.95),(-7,10.8,.95,.8),
    (-6.9,12.4,.78,.65),(-6.45,14.2,.65,.5),(-5.85,16.1,.58,.4),(-5.65,17.35,.54,.32))
COVER_SECTIONS = (-1,-.72,0,.72,1)
WALL_SECTIONS = (0,.3,.6,.84,1)
DECK_ROWS = ((4.75,5.32),(2.7,5.32),(-3.8,5.32),(-4.65,5.32),(-5.15,5.42))
ROLL_STATIONS = ((4,0),(3.7,.5),(3,1),(0,1),(-3,1),(-4.5,1))
ROLL_PROFILE = ((3.8,5.38),(4.02,5.24),(4.12,4.95),(4.02,4.63),(3.92,4.5))


def _span(poly, x):
    ys = [a[1]+(x-a[0])*(b[1]-a[1])/(b[0]-a[0])
          for a,b in zip(poly, (*poly[1:],poly[0]))
          if a[0] != b[0] and min(a[0],b[0]) <= x <= max(a[0],b[0])]
    return min(ys), max(ys)


def _cos_steps(a,b,n):
    return [a+(b-a)*(1-math.cos(math.pi*i/n))/2 for i in range(n+1)]




@cache
def _outline():
    return kit.spline(COWL_OUTLINE,D.BODY_OUTLINE_STEPS,True)


def _surface(xi,yi,x):
    # The calibrated photo rays remove the flank's parallax relative to the axle-plane i2m.
    rx,ry,rz = D.BODY_PHOTO_ROTATION
    vx,vy,vz = ((xi-D.BODY_PHOTO_CENTER[0])/D.BODY_PHOTO_FOCAL,
                (D.BODY_PHOTO_CENTER[1]-yi)/D.BODY_PHOTO_FOCAL,-1)
    vx,vy = math.cos(rz)*vx-math.sin(rz)*vy, math.sin(rz)*vx+math.cos(rz)*vy
    vy,vz = math.cos(rx)*vy-math.sin(rx)*vz, math.sin(rx)*vy+math.cos(rx)*vz
    vx,vz = math.cos(ry)*vx+math.sin(ry)*vz, -math.sin(ry)*vx+math.cos(ry)*vz
    origin = D.BODY_PHOTO_ORIGIN
    scale = (x-origin[0])/vx
    return [x,origin[1]+scale*vy,origin[2]+scale*vz]


def _saddle(xi):
    _,bottom = _span(SEAT_OUTLINE,max(D.BODY_SEAT_MIN,min(D.BODY_SEAT_MAX,xi)))
    z,y = D.i2m(xi,bottom)
    return [kit.smooth(SEAT_WIDTH,xi)+D.BODY_SADDLE_OVERHANG,y-D.BODY_SADDLE_DROP,z]


def _blend_saddle(point,xi,yi):
    t = kit.clamp((D.BODY_SADDLE_BLEND_Y-yi)/D.BODY_SADDLE_BLEND_SPAN)
    t = t*t*(3-2*t)
    return [a+(b-a)*t for a,b in zip(point,_saddle(xi))]


def _cowl_point(xi,t,side):
    top,bottom = _span(_outline(),xi)
    yi = top+(bottom-top)*(1-math.cos(t*math.pi))/2
    _,y = D.i2m(xi,yi)
    width,base = kit.smooth(COWL_WIDTH,xi),kit.smooth(COWL_BASE,xi)
    front = kit.clamp((D.BODY_COWL_FRONT-xi)/D.BODY_COWL_FRONT_ROLL)
    cross = [(t,base*b+width*w+front*r) for t,b,w,r in COWL_CROSS]
    x = kit.smooth(cross,t)
    along = kit.clamp((xi-D.BODY_COWL_REAR)/D.BODY_COWL_LENGTH)
    roll = max(0,(t-D.BODY_COWL_ROLL_START)/(1-D.BODY_COWL_ROLL_START))
    yi = D.I2M_ORIGIN_Y-(y+D.BODY_COWL_LIP_RISE*math.sin(along*math.pi)**2*roll*roll)/D.I2M_SCALE
    p = _surface(xi,yi,x)
    p[0] += (D.BODY_COWL_BULGE*math.exp(-((p[1]-D.BODY_COWL_BULGE_Y)/D.BODY_COWL_BULGE_HEIGHT)**2)
             * math.sin(math.pi*t)**D.BODY_COWL_BULGE_CROSS_POWER
             * math.sin(math.pi*along)**D.BODY_COWL_BULGE_LENGTH_POWER)
    p[0] *= side
    return p




def _geometry():
    panels, solids, plates = [], [], []

    def skin(rings,assembly,inside,material="paint"):
        for k,(a,b) in enumerate(zip(rings,rings[1:])):
            for j in range(len(a)-1):
                corners = (a[j],a[j+1],b[j],b[j+1])
                cube = kit.quad(*corners,D.BODY_PANEL_THICKNESS,{},inside(k,j),assembly=assembly)
                if cube is not None:
                    matrix = tilt.cube_matrix(cube.get("rotation",(0,0,0)))
                    normal = [row[2] for row in matrix]
                    distances = [sum((p[i]-cube["pivot"][i])*normal[i] for i in range(3)) for p in corners]
                    poly = [tuple(sum(matrix[i][j]*p[i] for i in range(3)) for j in range(2))
                            for p in (corners[0],corners[1],corners[3],corners[2])]
                    turns = []
                    for i,p in enumerate(poly):
                        q,r = poly[(i+1)%len(poly)],poly[(i+2)%len(poly)]
                        turns.append((q[0]-p[0])*(r[1]-q[1])-(q[1]-p[1])*(r[0]-q[0]))
                    concave = min(turns) < -kit.FRAME_EPSILON and max(turns) > kit.FRAME_EPSILON
                    # Twisted faces cannot share four edges; concave cutouts need separate convex masks.
                    if concave or max(distances)-min(distances) > D.BODY_PANEL_WARP_LIMIT:
                        A,B,C,E = corners
                        for triangle in ((A,B,C,C),(B,E,C,C)):
                            panel = kit.quad(*triangle,D.BODY_PANEL_THICKNESS,{},inside(k,j),assembly=assembly)
                            if panel is not None:
                                panels.append((panel,triangle,material))
                    else:
                        panels.append((cube,corners,material))

    def tube(points,size,material,assembly):
        solids.extend((cube,material) for cube in kit.tube(points,size,{},assembly=assembly))

    frame_ys = _cos_steps(FRAME_FRONT[0][0],FRAME_FRONT[-1][0],D.BODY_FRAME_STEPS)
    tunnel = []
    for i,yi in enumerate(frame_ys):
        xi = kit.smooth(FRAME_FRONT,yi)
        p = _blend_saddle(_surface(xi,yi,D.BODY_FRAME_PHOTO_X),xi,yi)
        t = i/D.BODY_FRAME_STEPS
        tunnel.append((p[2],p[1],D.BODY_FRAME_WIDTH+D.BODY_FRAME_FLARE*t**D.BODY_FRAME_FLARE_POWER,
                       D.BODY_FRAME_RISE+D.BODY_FRAME_RISE_GAIN*math.sin(t*math.pi/2)))
    tunnel.extend(TUNNEL_EXTENSION)
    # The lower cover must leave the innermost floor rail exposed on the deck.
    low, high = D.FLOOR_STRIPS["tunnel_blend_y"]
    tunnel = [(z,y,min(w,D.FLOOR_STRIPS["tunnel_half_width"])
               +(w-min(w,D.FLOOR_STRIPS["tunnel_half_width"]))*kit.clamp((y-low)/(high-low)),rise)
              for z,y,w,rise in tunnel]
    cover = []
    for i,(z,y,w,rise) in enumerate(tunnel):
        prev,nxt = tunnel[max(0,i-1)],tunnel[min(len(tunnel)-1,i+1)]
        dy,dz = nxt[1]-prev[1],nxt[0]-prev[0]
        length = math.hypot(dy,dz)
        cover.append([(u*w,y-math.cos(u*math.pi/2)*rise*dz/length,
                       z+math.cos(u*math.pi/2)*rise*dy/length) for u in COVER_SECTIONS])
    skin(cover,"body_frame",lambda k,j:(0,tunnel[k][1]-1,tunnel[k][0]+1))
    walls = []
    for side in (-1,1):
        rings = []
        for i,yi in enumerate(frame_ys):
            rear,front = kit.smooth(FRAME_REAR,yi),kit.smooth(FRAME_FRONT,yi)
            ring = []
            for u in WALL_SECTIONS:
                xi = rear+(front-rear)*u
                z,y = D.i2m(xi,yi)
                base = (D.BODY_TAIL_WIDTH+D.BODY_TAIL_Y_TAPER*(y-D.BODY_TAIL_TAPER_Y)
                        -D.BODY_TAIL_Z_TAPER*max(0,z-D.BODY_TAIL_TAPER_Z))
                p = _blend_saddle(_surface(xi,yi,base*(1-u*u)+tunnel[i][2]*u*u),xi,yi)
                if u == 1:
                    p = list(cover[i][-1])
                p[0] *= side
                ring.append(p)
            rings.append(ring)
        walls.append(rings)
        skin(rings,"body_tail",lambda k,j:(0,rings[k][0][1],rings[k][0][2]))
        tube([(side*(r[-1][0]+D.BODY_EDGE_OFFSET),r[-1][1],r[-1][2])
              for r in cover[:len(frame_ys)]],D.BODY_FRAME_EDGE_SIZE,"body_edge","body_frame")
    back = [[a[0],b[0]] for a,b in zip(*walls)]
    skin(back,"body_tail",lambda k,j:(0,back[k][0][1],back[k][0][2]-1))
    top = list(zip(walls[0][0],walls[1][0]))
    skin(top,"body_tail",lambda k,j:D.BODY_TAIL_INSIDE)

    for side in (-1,1):
        rings = [[_cowl_point(xi,t,side) for t in COWL_SECTIONS] for xi in COWL_STATIONS]
        skin(rings,"body_cowl",lambda k,j:(0,D.BODY_COWL_INSIDE_Y,rings[k][0][2]),
             "body_cowl_right" if side == 1 else "paint")
        returns = []
        for ring in rings:
            p = ring[-1]
            xi = D.I2M_ORIGIN_X-p[2]/D.I2M_SCALE
            arch = D.BODY_RETURN_ARCH*math.sin(math.pi*kit.clamp((xi-D.BODY_COWL_REAR)/D.BODY_COWL_LENGTH))
            q = [side*min(abs(p[0])-D.BODY_RETURN_INSET,D.BODY_COWL_INNER_X),
                 p[1]+D.BODY_RETURN_RISE+arch*D.BODY_RETURN_ARCH_GAIN,p[2]-D.BODY_RETURN_FORWARD]
            returns.append([p,q])
        skin(returns,"body_cowl",lambda k,j:(0,D.BODY_COWL_INSIDE_Y,rings[k][0][2]))
        for ring in (rings[0],rings[-1]):
            skin([[p,[side*D.BODY_COWL_INNER_X,p[1],p[2]]] for p in ring],
                 "body_cowl",lambda k,j:(0,D.BODY_COWL_INSIDE_Y,ring[0][2]))
        joins = []
        for ring in rings:
            p = ring[0]
            x = D.BODY_JOIN_FALLBACK_X
            wall = walls[side == 1]
            for a,b in zip(wall,wall[1:]):
                for j in range(len(a)-1):
                    for A,B,C in ((a[j],a[j+1],b[j]),(a[j+1],b[j+1],b[j])):
                        den = (B[2]-C[2])*(A[1]-C[1])+(C[1]-B[1])*(A[2]-C[2])
                        if abs(den) < kit.FRAME_EPSILON:
                            continue
                        u = ((B[2]-C[2])*(p[1]-C[1])+(C[1]-B[1])*(p[2]-C[2]))/den
                        v = ((C[2]-A[2])*(p[1]-C[1])+(A[1]-C[1])*(p[2]-C[2]))/den
                        if u >= 0 and v >= 0 and u+v <= 1:
                            x = abs(u*A[0]+v*B[0]+(1-u-v)*C[0])
            joins.append([p,[side*x,p[1],p[2]]])
        skin(joins,"body_cowl",lambda k,j:(0,joins[k][0][1]-1,joins[k][0][2]))
        poly = []
        for xi in _cos_steps(D.BODY_INNER_REAR,D.BODY_INNER_FRONT,D.BODY_INNER_STEPS):
            p = _surface(xi,_span(_outline(),xi)[0]+D.BODY_INNER_TOP_INSET,D.BODY_TAIL_WIDTH)
            poly.append((p[2],p[1]))
        poly.extend((r[-1][2],r[-1][1]+D.BODY_INNER_LIP) for r in reversed(returns))
        plates.append((poly,side*D.BODY_COWL_INNER_X))
        rim = []
        for xi,t in kit.spline(JOINT_ROUTE,D.BODY_JOINT_STEPS):
            p = _cowl_point(xi,t,side)
            rim.append([p[0]+side*D.BODY_PIPE_OFFSET,p[1]+D.BODY_PIPE_LIFT,p[2]])
        for i,(a,b) in enumerate(zip(rim,rim[1:])):
            fade = kit.clamp(((i+1)/(len(rim)-1)-D.BODY_PIPE_FADE_START)/D.BODY_PIPE_FADE_SPAN)
            tube([a,b],D.BODY_PIPE_SIZE*(1-D.BODY_PIPE_FADE_GAIN*fade),"body_pipe","body_cowl")

    tube([(x,D.BODY_REAR_PIPE_Y+D.BODY_REAR_PIPE_RISE*(x/D.BODY_REAR_PIPE_WIDTH)**2,
           D.BODY_REAR_PIPE_Z-D.BODY_REAR_PIPE_SWEEP*(x/D.BODY_REAR_PIPE_WIDTH)**2)
          for x in _cos_steps(-D.BODY_REAR_PIPE_WIDTH,D.BODY_REAR_PIPE_WIDTH,D.BODY_REAR_PIPE_STEPS)],
         D.BODY_REAR_PIPE_SIZE,"body_pipe","body_tail")
    skin([[(-D.BODY_DECK_HALF_WIDTH,y,z),(D.BODY_DECK_HALF_WIDTH,y,z)] for z,y in DECK_ROWS],
         "body_floor",lambda k,j:(0,DECK_ROWS[k][1]-1,DECK_ROWS[k][0]))
    for side in (-1,1):
        roll = [[(side*(D.BODY_ROLL_X+(x-D.BODY_ROLL_X)*radius),
                  D.BODY_DECK_Y+(y-D.BODY_DECK_Y)*radius,z) for x,y in ROLL_PROFILE]
                for z,radius in ROLL_STATIONS]
        skin(roll,"body_floor",lambda k,j:(side*D.BODY_ROLL_INSIDE_X,D.BODY_ROLL_INSIDE_Y,ROLL_STATIONS[k][0]))
    return panels,solids,plates


@cache
def _prepared():
    panels,solids,plates = _geometry()
    regions = []
    masks = {"paint": [], "body_cowl_right": []}
    panel_uv = []
    for index,(cube,corners,material) in enumerate(panels):
        name = f"body_panel_{index}"
        matrix = tilt.cube_matrix(cube.get("rotation",(0,0,0)))
        pivot = cube.get("pivot",(0,0,0))
        poly = [tuple(sum(matrix[i][j]*(p[i]-pivot[i]) for i in range(3))+pivot[j]
                      for j in range(2)) for p in (corners[0],corners[1],corners[3],corners[2])]
        lo = cube["origin"]
        width,height = cube["size"][:2]
        normalized = [((x-lo[0])/width,(y-lo[1])/height) for x,y in poly]
        region = _panel_region(name,normalized,material,cube)
        slot = len(masks[material])
        masks[material].append(bytes(channel for v in range(region.height) for u in range(region.width)
                                     for channel in region.pixel(u,v)))
        panel_uv.append(("body_panels" if material == "paint" else "body_cowl_right",slot))
    # Packing each mask independently makes MaxRects quadratic in the panel count.
    for material,tiles in masks.items():
        name = "body_panels" if material == "paint" else "body_cowl_right"
        # Neighboring tiles each supply half of the two-texel transparent gutter.
        gutter = atlas.GUTTER_TEXELS // 2
        stride = D.BODY_PANEL_TEXELS + 2*gutter
        columns = math.ceil(math.sqrt(len(tiles)))
        rows = math.ceil(len(tiles)/columns)
        def pixel(u,v,tiles=tiles,columns=columns,stride=stride,gutter=gutter):
            column,x = divmod(u,stride)
            row,y = divmod(v,stride)
            x,y = x-gutter,y-gutter
            index = row*columns+column
            if index >= len(tiles) or not (0 <= x < D.BODY_PANEL_TEXELS and 0 <= y < D.BODY_PANEL_TEXELS):
                return atlas.CLEAR
            offset = (y*D.BODY_PANEL_TEXELS+x)*4
            return tuple(tiles[index][offset:offset+4])
        regions.append((name,atlas.Region(name,columns*stride,rows*stride,
            atlas.Material.PAINT,pixel)))
        for i,entry in enumerate(panel_uv):
            if entry[0] == name:
                sheet,slot = entry
                panel_uv[i] = (sheet,(slot%columns)*stride+gutter,
                               (slot//columns)*stride+gutter)
    for index,(poly,x) in enumerate(plates):
        name = f"body_inner_{index}"
        w,h,pixel = atlas.outline_pixel(poly,D.BODY_PLATE_DENSITY,
                                       atlas.paint_pixel(D.BODY_PLATE_TEXELS,D.BODY_PLATE_TEXELS))
        regions.append((name,atlas.Region(name,w,h,atlas.Material.PAINT,pixel)))
    return panels,solids,plates,regions,panel_uv


def _camera_point(point):
    x,y,z = [p-o for p,o in zip(point,D.BODY_PHOTO_ORIGIN)]
    rx,ry,rz = D.BODY_PHOTO_ROTATION
    x,z = math.cos(ry)*x-math.sin(ry)*z,math.sin(ry)*x+math.cos(ry)*z
    y,z = math.cos(rx)*y+math.sin(rx)*z,-math.sin(rx)*y+math.cos(rx)*z
    x,y = math.cos(rz)*x+math.sin(rz)*y,-math.sin(rz)*x+math.cos(rz)*y
    return x,y,z


def _photo(point):
    x,y,z = _camera_point(point)
    return D.BODY_PHOTO_CENTER[0]-D.BODY_PHOTO_FOCAL*x/z,D.BODY_PHOTO_CENTER[1]+D.BODY_PHOTO_FOCAL*y/z


def _is_vent(x,y):
    for xa,xb,yi in VENTS:
        u = (x-xa)/(xb-xa)
        if not 0 < u < 1:
            continue
        cap = min(1,u/D.BODY_VENT_CAP,(1-u)/D.BODY_VENT_CAP)
        half = D.BODY_VENT_HALF_HEIGHT*math.sqrt(max(0,1-(1-cap)**2))
        mid = yi+D.BODY_VENT_SLOPE*u+D.BODY_VENT_BOW*math.sin(math.pi*u)
        if abs(y-mid) < half:
            return True
    return False


def _panel_region(name,poly,material,cube):
    size = D.BODY_PANEL_TEXELS
    color = atlas.paint_pixel(D.BODY_PAINT_TEXELS,D.BODY_PAINT_TEXELS)
    matrix = tilt.cube_matrix(cube.get("rotation",(0,0,0)))
    pivot = cube.get("pivot",(0,0,0))

    lo = cube["origin"]
    width,height,depth = cube["size"]
    corner = [pivot[i]+sum(matrix[i][j]*(lo[j]-pivot[j]) for j in range(3))
              + matrix[i][2]*depth for i in range(3)]
    dx = [row[0]*width for row in matrix]
    dy = [row[1]*height for row in matrix]
    camera = _camera_point(corner)
    camera_x = [p-a for p,a in zip(_camera_point([p+d for p,d in zip(corner,dx)]),camera)]
    camera_y = [p-a for p,a in zip(_camera_point([p+d for p,d in zip(corner,dy)]),camera)]
    colors = []
    for v in range(size):
        y = 1-(v+.5)/size
        shade_v = kit.clamp((D.BODY_PAINT_TOP-corner[1]-dy[1]*y)/D.BODY_PAINT_HEIGHT)*(D.BODY_PAINT_TEXELS-1)
        rgb = color(0,shade_v)[:3]
        row = []
        for u in range(size):
            x = (u+.5)/size
            value = rgb
            if material == "body_cowl_right":
                cx,cy,cz = [a+b*x+c*y for a,b,c in zip(camera,camera_x,camera_y)]
                if _is_vent(D.BODY_PHOTO_CENTER[0]-D.BODY_PHOTO_FOCAL*cx/cz,
                            D.BODY_PHOTO_CENTER[1]+D.BODY_PHOTO_FOCAL*cy/cz):
                    value = D.BODY_SLOT_COLOR
            row.append(value)
        colors.append(row)

    winding = sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(poly,(*poly[1:],poly[0])))
    direction = 1 if winding >= 0 else -1
    spans = []
    for v in range(size):
        y = 1-(v+.5)/size
        left,right = 0,1
        for a,b in zip(poly,(*poly[1:],poly[0])):
            coefficient = -direction*(b[1]-a[1])
            constant = direction*((b[0]-a[0])*(y-a[1])+(b[1]-a[1])*a[0])
            if abs(coefficient) < kit.FRAME_EPSILON:
                if constant < -D.BODY_MASK_OVERLAP:
                    left,right = 1,0
            else:
                bound = (-D.BODY_MASK_OVERLAP-constant)/coefficient
                if coefficient > 0:
                    left = max(left,bound)
                else:
                    right = min(right,bound)
        spans.append((left,right))

    def pixel(u,v):
        left,right = spans[v]
        return (*colors[v][u],255 if left <= (u+.5)/size <= right else 0)
    return atlas.Region(name,size,size,atlas.Material.PAINT,pixel)


def register_regions(registry):
    existing = {r.name for r in registry.regions()}
    extra = [(name,atlas.Region(name,atlas.SMALL_TEXELS,atlas.SMALL_TEXELS,material,
                               lambda u,v,c=color:(*c,255)))
             for name,material,color in (("body_pipe",atlas.Material.RUBBER,D.BODY_PIPE_COLOR),
                ("body_slot",atlas.Material.RUBBER,D.BODY_SLOT_COLOR),
                ("body_edge",atlas.Material.CHROME,D.BODY_EDGE_COLOR))]
    for name,region in [*extra,*_prepared()[3]]:
        if name not in existing:
            registry.register(region)


def build() -> kit.AreaCubes:
    register_regions(atlas.REGISTRY)
    panels,solids,plates,_,panel_uv = _prepared()
    result = kit.AreaCubes()
    for index,(template,_,material) in enumerate(panels):
        cube = copy.deepcopy(template)
        cube["uv"] = atlas.faces("clear")
        name,u,v = panel_uv[index]
        # The final x mirror reverses the local horizontal axis of both panel faces.
        cube["uv"]["south"] = atlas.face(name,u+D.BODY_PANEL_TEXELS,v,-D.BODY_PANEL_TEXELS,D.BODY_PANEL_TEXELS)
        cube["uv"]["north"] = atlas.face(name,u+D.BODY_PANEL_TEXELS,v,-D.BODY_PANEL_TEXELS,D.BODY_PANEL_TEXELS)
        result.add("body",cube)
    for template,material in solids:
        cube = copy.deepcopy(template)
        cube["uv"] = atlas.faces(material)
        result.add("body",cube)
    for index,(poly,x) in enumerate(plates):
        result.add("body",kit.profile_plate(poly,x,D.BODY_INNER_THICKNESS,f"body_inner_{index}"),"body_cowl")
    return result


def trailing_cube_count():
    return len(_prepared()[2])
