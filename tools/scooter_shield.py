"""Pressed shield and steering fender in the frozen spike's unmirrored frame."""

import copy
import math
from functools import cache

from tool_loader import load_tool

D = load_tool("scooter_dims")
kit = load_tool("scooter_kit")
atlas = load_tool("scooter_atlas")
tilt = load_tool("cube_tilt")
AREA = "shield"

SPINE = ((188,570,.36),(215,582,.44),(245,599,.66),(272,606,.94),
         (296,615,1.2),(307,619,1.34),(315,623,1.47),(322,627,1.61),(331,630,1.78))
ROWS = (D.SHIELD_BOTTOM,5.4,6.8,8.4,10.1,11.7,13.3,14.8,
        D.SHIELD_TOP-D.SHIELD_CORNER_RADIUS)
FACE_SECTIONS = (-1,-.78,-.4,0,.4,.78,1)
SPINE_SECTIONS = (-1,-.65,0,.65,1)
TOP = ((553,412),(565,381),(580,358),(600,341),(630,331),
       (660,328),(690,333),(715,345),(735,362),(746,381))
BOT = ((553,446),(565,435),(585,418),(610,402),(640,392),
       (670,391),(700,395),(725,392),(746,384))
FENDER_STATIONS = (553,557,565,583,608,640,675,700,715,724,730,736,740,743,745,746)
FENDER_WIDTH = ((715,1),(730,.98),(746,.92))
LIP_DROP = ((700,1),(724,.8),(738,.36),(746,.12))
FENDER_BOLTS = ((592,378),(606,371))
HORN_POSITION = (615,296)
EDGE_MODEL = tuple(sorted((D.i2m(x,y)[1],D.i2m(x,y)[0]) for y,x in D.SHIELD_EDGE))


def _clamp(t):
    return max(0,min(1,t))


def _smooth(points,x,column=1):
    i = 0
    while i < len(points)-2 and x > points[i+1][0]:
        i += 1
    a,b = points[i:i+2]
    prev,nxt = points[max(0,i-1)],points[min(len(points)-1,i+2)]
    t = _clamp((x-a[0])/(b[0]-a[0]))
    ma = (b[column]-prev[column])/(b[0]-prev[0])
    mb = (nxt[column]-a[column])/(nxt[0]-a[0])
    return ((2*t**3-3*t*t+1)*a[column]+(t**3-2*t*t+t)*(b[0]-a[0])*ma
            +(-2*t**3+3*t*t)*b[column]+(t**3-t*t)*(b[0]-a[0])*mb)


def _edge_z(y):
    return _smooth(EDGE_MODEL,y)


def _shield_z(x,y):
    u = _clamp((y-D.SHIELD_RELIEF_Y)/D.SHIELD_RELIEF_HEIGHT)
    relief = D.SHIELD_RELIEF_MIN+(1-D.SHIELD_RELIEF_MIN)*u*u*(3-2*u)
    return (_edge_z(y)-relief*(D.SHIELD_DEPTH_MIN+D.SHIELD_DEPTH_GAIN
            *math.exp(-((y-D.SHIELD_RELIEF_CROWN_Y)/D.SHIELD_RELIEF_HEIGHT)**2))
            *(1-(x/D.SHIELD_HALF_WIDTH)**2))


def _shield_top(x):
    r = D.SHIELD_CORNER_RADIUS
    d = abs(x)-(D.SHIELD_HALF_WIDTH-r)
    return D.SHIELD_TOP if d <= 0 else D.SHIELD_TOP-r+math.sqrt(max(0,r*r-d*d))


def _face_point(x,y):
    y = min(y,_shield_top(x))
    return (x,y,_shield_z(x,y))


def _fender_width(xi):
    if xi < D.SHIELD_FENDER_WIDTH_FULL:
        return (D.SHIELD_FENDER_REAR_WIDTH+(xi-D.SHIELD_FENDER_REAR)
                *D.SHIELD_FENDER_WIDTH_GAIN/D.SHIELD_FENDER_WIDTH_SPAN)
    return D.SHIELD_FENDER_HALF_WIDTH*_smooth(FENDER_WIDTH,xi)


def _lip_drop(xi):
    return _smooth(LIP_DROP,xi)


def _lip_bottom(xi):
    u = max(0,(xi-D.SHIELD_FENDER_LIP_START)/D.SHIELD_FENDER_LIP_SPAN)
    upper = _smooth(TOP,xi)+D.SHIELD_FENDER_LIP_UPPER*_lip_drop(xi)
    return _smooth(BOT,xi)*(1-u**4)+(upper+D.SHIELD_FENDER_LIP_END)*u**4


def _fender_rings():
    rings = []
    for xi in FENDER_STATIONS:
        z,y = D.i2m(xi,_smooth(TOP,xi))
        _,bottom = D.i2m(xi,_lip_bottom(xi))
        w = _fender_width(xi)
        arch = []
        for j in range(D.SHIELD_FENDER_ARCH_STEPS+1):
            u = 2*j/D.SHIELD_FENDER_ARCH_STEPS-1
            drop = D.SHIELD_FENDER_ARCH_DROP*(1-math.sqrt(max(0,1-u*u)))
            arch.append((u*w,y-drop*_lip_drop(xi),z))
        rings.append([(-w,bottom,z),*arch,(w,bottom,z)])
    return rings


def _geometry():
    panels,solids = [],[]

    def skin(bone,rings,assembly,inside,material,thick=D.SHIELD_PANEL_THICKNESS):
        for k,(a,b) in enumerate(zip(rings,rings[1:])):
            for j in range(len(a)-1):
                points = (a[j],a[j+1],b[j],b[j+1])
                inside_point = inside(k,j)
                cube = kit.quad(*points,thick,{},inside_point,assembly=assembly)
                if cube is None:
                    continue
                matrix = tilt.cube_matrix(cube.get("rotation",(0,0,0)))
                poly = [tuple(sum(matrix[i][axis]*p[i] for i in range(3)) for axis in range(2))
                        for p in (points[0],points[1],points[3],points[2])]
                turns = []
                for index,p in enumerate(poly):
                    q,r = poly[(index+1)%4],poly[(index+2)%4]
                    turns.append((q[0]-p[0])*(r[1]-q[1])-(q[1]-p[1])*(r[0]-q[0]))
                concave = min(turns)<-kit.FRAME_EPSILON and max(turns)>kit.FRAME_EPSILON
                pa,pb,pc,pd = points
                u,v = [q-p for p,q in zip(pa,pb)],[q-p for p,q in zip(pa,pc)]
                normal = (u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])
                length = math.sqrt(sum(n*n for n in normal))
                warp = abs(sum((pd[i]-pa[i])*normal[i] for i in range(3)))/length if length else 0
                # Twisted faces cannot share four edges; triangle cutouts retain the measured seams.
                if concave or warp>D.SHIELD_PANEL_WARP_LIMIT:
                    for triangle in ((pa,pb,pc,pc),(pb,pd,pc,pc)):
                        patch = kit.quad(*triangle,thick,{},inside_point,assembly=assembly)
                        if patch is not None:
                            panels.append((bone,patch,triangle,material))
                else:
                    panels.append((bone,cube,points,material))

    rings = [[_face_point(t*D.SHIELD_HALF_WIDTH,y) for t in FACE_SECTIONS] for y in ROWS]
    skin("body",rings,"shield_face",lambda k,j:(0,ROWS[k],_edge_z(ROWS[k])+1),"face")
    r,w = D.SHIELD_CORNER_RADIUS,D.SHIELD_HALF_WIDTH
    shoulder_x = ([-w+r-r*math.cos(i*math.pi/12) for i in range(7)]
                  +[-r,0,r]+[w-r+r*math.sin(i*math.pi/12) for i in range(7)])
    shoulder = [[_face_point(x,y) for x in shoulder_x] for y in (D.SHIELD_TOP-r,D.SHIELD_TOP)]
    skin("body",shoulder,"shield_face",lambda k,j:(0,D.SHIELD_TOP-1,-4),"face")

    trim = []
    for k in range(D.SHIELD_TRIM_SIDE_STEPS+1):
        y = D.SHIELD_BOTTOM+(D.SHIELD_TOP-r-D.SHIELD_BOTTOM)*k/D.SHIELD_TRIM_SIDE_STEPS
        trim.append((-w,y,_shield_z(w,y)+D.SHIELD_TRIM_OFFSET))
    for k in range(1,D.SHIELD_TRIM_CORNER_STEPS+1):
        a = math.pi-math.pi/2*k/D.SHIELD_TRIM_CORNER_STEPS
        x,y = -w+r+r*math.cos(a),D.SHIELD_TOP-r+r*math.sin(a)
        trim.append((x,y,_shield_z(x,y)+D.SHIELD_TRIM_OFFSET))
    for k in range(1,D.SHIELD_TRIM_TOP_STEPS+1):
        x = -w+r+2*(w-r)*k/D.SHIELD_TRIM_TOP_STEPS
        trim.append((x,D.SHIELD_TOP,_shield_z(x,D.SHIELD_TOP)+D.SHIELD_TRIM_OFFSET))
    for k in range(1,D.SHIELD_TRIM_CORNER_STEPS+1):
        a = math.pi/2-math.pi/2*k/D.SHIELD_TRIM_CORNER_STEPS
        x,y = w-r+r*math.cos(a),D.SHIELD_TOP-r+r*math.sin(a)
        trim.append((x,y,_shield_z(x,y)+D.SHIELD_TRIM_OFFSET))
    for k in range(1,D.SHIELD_TRIM_SIDE_STEPS+1):
        y = D.SHIELD_TOP-r-(D.SHIELD_TOP-r-D.SHIELD_BOTTOM)*k/D.SHIELD_TRIM_SIDE_STEPS
        trim.append((w,y,_shield_z(w,y)+D.SHIELD_TRIM_OFFSET))
    for cube in kit.tube(trim,D.SHIELD_TRIM_SIZE,{},assembly="shield_trim"):
        solids.append(("body",cube,"chrome"))

    spine = []
    for i in range(D.SHIELD_SPINE_STEPS+1):
        yi = SPINE[0][0]+(SPINE[-1][0]-SPINE[0][0])*i/D.SHIELD_SPINE_STEPS
        z,y = D.i2m(_smooth(SPINE,yi),yi)
        hw = _smooth(SPINE,yi,2)
        back = _shield_z(hw,y)+D.SHIELD_SPINE_BACK_OFFSET
        spine.append([(hw*u,y-D.SHIELD_SPINE_END_DROP*u*u
                       *max(0,(yi-D.SHIELD_SPINE_DROP_START)/D.SHIELD_SPINE_DROP_SPAN)**2,
                       back+(z-back)*math.cos(u*math.pi/2)) for u in SPINE_SECTIONS])
    skin("body",spine,"shield_ridge",lambda k,j:(0,spine[k][0][1],
         _shield_z(0,spine[k][0][1])+.5),"spine",D.SHIELD_SPINE_THICKNESS)
    rings = _fender_rings()
    skin("steer",rings,"shield_fender",lambda k,j:(0,rings[k][0][1]-2,rings[k][0][2]),"fender")
    for side in (0,len(rings[0])-1):
        curl = [[r[side],(r[side][0]-math.copysign(D.SHIELD_FENDER_CURL_INSET,r[side][0]),
                  r[side][1]+D.SHIELD_FENDER_CURL_RISE,r[side][2])] for r in rings]
        skin("steer",curl,"shield_fender",lambda k,j:(0,rings[k][0][1]+1,rings[k][0][2]),"fender")
    for ring,sign in ((rings[0],-1),(rings[-1],1)):
        curl = [[p,(p[0]*D.SHIELD_FENDER_END_SCALE,p[1]+D.SHIELD_FENDER_END_RISE,
                    p[2]+sign*D.SHIELD_FENDER_END_OFFSET)] for p in ring]
        skin("steer",curl,"shield_fender",lambda k,j:(0,ring[0][1]-1,ring[0][2]),"fender")
    for xi,yi in FENDER_BOLTS:
        z,y = D.i2m(xi,yi)
        x,h = _fender_width(xi),D.SHIELD_BOLT_HALF_SIZE
        cube = kit.box((x-D.SHIELD_BOLT_INSET,y-h,z-h),(x+D.SHIELD_BOLT_OUTSET,y+h,z+h),{})
        solids.append(("steer",cube,"chrome"))
    return panels,solids


def _shade(material,p):
    x,y,z = p
    if material == "face":
        a,b,c = D.SHIELD_FACE_SHADE
        factor = a+b*(1-(x/D.SHIELD_HALF_WIDTH)**2)+c*math.cos((y-D.SHIELD_FACE_SHADE_Y)*D.SHIELD_FACE_SHADE_FREQUENCY)
        color = D.SHIELD_PAINT
    elif material == "spine":
        yi = D.I2M_ORIGIN_Y-y/D.I2M_SCALE
        u = min(1,abs(x)/_smooth(SPINE,yi,2))
        a,b = D.SHIELD_SPINE_SHADE
        factor = a+b*math.cos(u*math.pi/2)
        color = D.SHIELD_SPINE_PAINT
    else:
        xi = max(TOP[0][0],min(TOP[-1][0],D.I2M_ORIGIN_X-z/D.I2M_SCALE))
        _,crown = D.i2m(xi,_smooth(TOP,xi))
        depth = max(0,crown-y)
        a,b,c = D.SHIELD_FENDER_SHADE
        factor = (a+b*math.exp(-(x/D.SHIELD_FENDER_SHADE_WIDTH)**2)
                  +c*math.exp(-((depth-D.SHIELD_FENDER_SHADE_DEPTH)/D.SHIELD_FENDER_SHADE_HEIGHT)**2))
        color = D.SHIELD_SPINE_PAINT
    return tuple(max(0,min(255,round(c*factor))) for c in color)


def _panel_pixels(cube,points,material):
    matrix = tilt.cube_matrix(cube.get("rotation",(0,0,0)))
    pivot = cube.get("pivot",(0,0,0))
    lo,size = cube["origin"],cube["size"]
    poly = [tuple(sum(matrix[i][j]*(p[i]-pivot[i]) for i in range(3))+pivot[j]
                  for j in range(2)) for p in (points[0],points[1],points[3],points[2])]
    pixels = bytearray()
    for v in range(D.SHIELD_PANEL_TEXELS):
        y = lo[1]+size[1]*(1-(v+.5)/D.SHIELD_PANEL_TEXELS)
        for u in range(D.SHIELD_PANEL_TEXELS):
            x = lo[0]+size[0]*(u+.5)/D.SHIELD_PANEL_TEXELS
            inside = False
            distance = math.inf
            for a,b in zip(poly,(*poly[1:],poly[0])):
                if (a[1]>y) != (b[1]>y) and x < a[0]+(y-a[1])*(b[0]-a[0])/(b[1]-a[1]):
                    inside = not inside
                dx,dy = b[0]-a[0],b[1]-a[1]
                t = _clamp(((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy)) if dx or dy else 0
                distance = min(distance,math.hypot(x-a[0]-t*dx,y-a[1]-t*dy))
            local = (x,y,lo[2]+size[2])
            p = [pivot[i]+sum(matrix[i][j]*(local[j]-pivot[j]) for j in range(3)) for i in range(3)]
            pixels.extend((*_shade(material,p),255 if inside or distance <= D.SHIELD_MASK_ALLOWANCE else 0))
    return bytes(pixels)


def _horn_pixel(u,v):
    n = D.SHIELD_HORN_TEXELS
    x,y = (u+.5)/n,(v+.5)/n
    radius = math.hypot(2*x-1,2*y-1)
    if radius > D.SHIELD_HORN_RIM_RADIUS:
        return atlas.CLEAR
    if radius < D.SHIELD_HORN_FACE_RADIUS:
        color = D.SHIELD_HORN_FACE_COLOR
    else:
        color = atlas._chrome(0,int(y*atlas.REGION_TEXELS))[:3]
    if (D.SHIELD_HORN_SLOT_TOP <= y < D.SHIELD_HORN_SLOT_BOTTOM
            and any(D.SHIELD_HORN_SLOT_START+i*D.SHIELD_HORN_SLOT_STEP <= x
                    < D.SHIELD_HORN_SLOT_START+i*D.SHIELD_HORN_SLOT_STEP+D.SHIELD_HORN_SLOT_WIDTH
                    for i in range(D.SHIELD_HORN_SLOT_COUNT))):
        color = D.SHIELD_HORN_SLOT_COLOR
    return (*color,255)


@cache
def _prepared():
    panels,solids = _geometry()
    tiles = [_panel_pixels(cube,points,material) for _,cube,points,material in panels]
    columns = D.SHIELD_PANEL_COLUMNS
    stride = D.SHIELD_PANEL_TEXELS+2*atlas.GUTTER_TEXELS
    def pixel(u,v):
        column,x = divmod(u,stride)
        row,y = divmod(v,stride)
        x,y = x-atlas.GUTTER_TEXELS,y-atlas.GUTTER_TEXELS
        index = row*columns+column
        if index >= len(tiles) or not (0 <= x < D.SHIELD_PANEL_TEXELS and 0 <= y < D.SHIELD_PANEL_TEXELS):
            return atlas.CLEAR
        offset = (y*D.SHIELD_PANEL_TEXELS+x)*4
        return tuple(tiles[index][offset:offset+4])
    regions = [atlas.Region("shield_panels",columns*stride,math.ceil(len(tiles)/columns)*stride,
                            atlas.Material.PAINT,pixel),
               atlas.Region("shield_horn",D.SHIELD_HORN_TEXELS,D.SHIELD_HORN_TEXELS,
                            atlas.Material.CHROME,_horn_pixel)]
    heights = [D.SHIELD_BOTTOM+(D.SHIELD_TOP-D.SHIELD_CORNER_RADIUS-D.SHIELD_BOTTOM)
               *(1-math.cos(math.pi*i/D.SHIELD_SIDE_STEPS))/2 for i in range(D.SHIELD_SIDE_STEPS+1)]
    outline = [(_edge_z(y)+D.SHIELD_SIDE_FRONT,y) for y in heights]
    outline += [(_edge_z(y)+D.SHIELD_SIDE_REAR,y) for y in reversed(heights)]
    w,h,fn = atlas.outline_pixel(outline,D.SHIELD_PLATE_DENSITY,
                                lambda u,v:(*D.SHIELD_PAINT,255))
    regions.append(atlas.Region("shield_side",w,h,atlas.Material.PAINT,fn))
    arc = [(x,D.SHIELD_CROWN_Y-D.SHIELD_CROWN_DROP*(x/D.SHIELD_CROWN_HALF_WIDTH)**2)
           for x in [-D.SHIELD_CROWN_HALF_WIDTH+2*D.SHIELD_CROWN_HALF_WIDTH*i/D.SHIELD_CROWN_STEPS
                     for i in range(D.SHIELD_CROWN_STEPS+1)]]
    crown = [*arc,*[(x,y-D.SHIELD_CROWN_HEIGHT) for x,y in reversed(arc)]]
    w,h,fn = atlas.outline_pixel(crown,D.SHIELD_CROWN_DENSITY,
                                lambda u,v:(*D.SHIELD_CROWN_COLOR,255))
    regions.append(atlas.Region("shield_crown",w,h,atlas.Material.RUBBER,fn))
    return panels,solids,regions,outline,crown


def register_regions(registry):
    existing = {r.name for r in registry.regions()}
    for region in _prepared()[2]:
        if region.name not in existing:
            registry.register(region)
            existing.add(region.name)


def build() -> kit.AreaCubes:
    register_regions(atlas.REGISTRY)
    panels,solids,_,outline,crown = _prepared()
    result = kit.AreaCubes()
    stride = D.SHIELD_PANEL_TEXELS+2*atlas.GUTTER_TEXELS
    for index,(bone,template,_,_) in enumerate(panels):
        cube = copy.deepcopy(template)
        cube["uv"] = atlas.faces("clear")
        u = (index%D.SHIELD_PANEL_COLUMNS)*stride+atlas.GUTTER_TEXELS
        v = (index//D.SHIELD_PANEL_COLUMNS)*stride+atlas.GUTTER_TEXELS
        # The final x mirror reverses the local horizontal axis on these panel faces.
        for face in ("north","south"):
            cube["uv"][face] = atlas.face("shield_panels",u+D.SHIELD_PANEL_TEXELS,v,
                                          -D.SHIELD_PANEL_TEXELS,D.SHIELD_PANEL_TEXELS)
        result.add(bone,cube)
    for bone,template,material in solids:
        cube = copy.deepcopy(template)
        cube["uv"] = atlas.faces(material)
        result.add(bone,cube)
    for side in (-1,1):
        result.add("body",kit.profile_plate(outline,side*D.SHIELD_HALF_WIDTH,
                   D.SHIELD_SIDE_THICKNESS,"shield_side"))
    z,y = D.i2m(*HORN_POSITION)
    diameter = D.SHIELD_HORN_DIAMETER*D.SHIELD_HORN_SCALE
    depth = D.SHIELD_HORN_DEPTH*D.SHIELD_HORN_SCALE
    z += D.SHIELD_HORN_OFFSET
    horn = kit.box((-diameter/2,y-diameter/2,z-depth/2),(diameter/2,y+diameter/2,z+depth/2),atlas.faces("clear"))
    horn["uv"]["north"] = atlas.face("shield_horn")
    horn.update(pivot=[0,y,z],rotation=[-math.degrees(D.SHIELD_HORN_PITCH),0,0])
    result.add("body",horn)
    cube = kit.profile_plate(crown,0,D.SHIELD_CROWN_THICKNESS,"shield_crown")
    # The spike rotates this profile plate about y, placing its former z extent across x.
    cube["origin"] = [cube["origin"][2],cube["origin"][1],D.SHIELD_CROWN_Z-D.SHIELD_CROWN_THICKNESS/2]
    cube["size"] = [cube["size"][2],cube["size"][1],D.SHIELD_CROWN_THICKNESS]
    cube["uv"] = atlas.faces("clear")
    for face in ("north","south"):
        cube["uv"][face] = atlas.face("shield_crown")
    result.add("steer",cube)
    return result
