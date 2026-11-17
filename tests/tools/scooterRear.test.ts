import { afterAll, describe, it } from "vitest";
import { startPythonWorker } from "../support/pythonWorker";

const python = startPythonWorker();
afterAll(() => python.close());

describe("scooter rear plate", () => {
  it("fits fine lamp panels to their full frame and preserves it through mirroring", async () => {
    await python.run(`import math, sys
sys.path.insert(0, 'tools')
from tool_loader import load_tool
r=load_tool('scooter_rear')
t=load_tool('cube_tilt')
k=r.kit
matrix=t.cube_matrix([27,19,38])
center=[0,10,16]
def place(p):
    return [center[i]+v for i,v in enumerate(t.apply_matrix(matrix,p))]
points=[place([x,y,0]) for y in (-0.2,0.2) for x in (-0.3,0.3)]
cube=r._lamp_panel(*points,0.06,r.atlas.faces('lens_tail'),place([0,0,-1]),'lamp_frame_probe')
assert all(abs(a-b)<1e-8 for a,b in zip(cube['size'],[0.6+2*r.LAMP_PANEL_MARGIN,0.4+2*r.LAMP_PANEL_MARGIN,0.06]))
actual=t.cube_matrix(cube['rotation'])
assert max(abs(actual[i][j]-matrix[i][j]) for i in range(3) for j in range(3))<1e-8
before=t.corners(cube)
k.mirror_to_game([dict(name='tail_lights',pivot=[0,0,0],cubes=[cube])])
after=t.corners(cube)
assert all(any(math.dist([-p[0],p[1],p[2]],q)<1e-5 for q in after) for p in before)
`);
  });

  it("mounts the chrome flange and plate against the tail wall with separate lens bones", async () => {
    await python.run(`import math, sys
sys.path.insert(0, 'tools')
from tool_loader import load_tool
r=load_tool('scooter_rear')
t=load_tool('cube_tilt')
a=load_tool('scooter_atlas')
wall=r.TAIL_WALL
def distance(p):
    y,z=p[1:]
    lo,hi=next((a,b) for a,b in zip(wall,wall[1:]) if a[0]<=y<=b[0])
    slope=(hi[1]-lo[1])/(hi[0]-lo[0])
    return (z-lo[1]-(y-lo[0])*slope)/math.hypot(1,slope)
result=r.kit.AreaCubes()
r._lamp(result)
for bone,cubes in result.items():
    for cube in cubes:
        assert bone==('tail_lights' if a.REGISTRY._regions[cube['uv']['south'].region].material==a.Material.LENS else 'body')
        if a.REGISTRY._regions[cube['uv']['south'].region].material==a.Material.CHROME:
            assert bone=='body'
assert set(result)=={'body','tail_lights'}
assert all(a.REGISTRY._regions[c['uv']['south'].region].material==a.Material.LENS for c in result['tail_lights'])
flange=result['body'][r.LAMP_RING_POINTS*(len(r.LAMP_SHELL)-1):r.LAMP_RING_POINTS*len(r.LAMP_SHELL)]
contacts=[p for c in flange for p in t.corners(c)]
gaps=[distance(p) for p in contacts]
assert max(gaps)<=r.LAMP_WALL_TOLERANCE, ('floating flange',min(gaps),max(gaps))
assert min(gaps)>=-r.LAMP_WALL_EMBED_LIMIT, ('buried flange',min(gaps),max(gaps))
r.register_regions(a.REGISTRY)
plate=r.kit.AreaCubes()
r._plate(plate)
points=t.corners(plate['body'][0])
top=sorted(points,key=lambda p:p[1])[-4:]
assert max(distance(p) for p in top)<=r.PLATE_WALL_TOLERANCE
assert min(distance(p) for p in top)>=-0.2
lamp_bottom=min(p[1] for c in result.assemblies[r.LAMP_ASSEMBLY] for p in t.corners(c))
assert abs(lamp_bottom-max(p[1] for p in top))<0.2
`);
  });

  it("projects the generated south face into an upright MDR over 39 rear bitmap", async () => {
    await python.run(`import math, sys
sys.path.insert(0, 'tools')
from tool_loader import load_tool
g=load_tool('gen_scooter')
r=load_tool('scooter_rear')
t=load_tool('cube_tilt')
geo,layout,pixels=g.build()
ox,oy=layout.origin('plate_text')
w,h=24,26
plates=[c for b in geo['minecraft:geometry'][0]['bones'] for c in b['cubes']
        if c['uv']['south']['uv']==[ox,oy]]
assert len(plates)==1
cube=plates[0]
# Bedrock model +x points left on screen when looking toward the front from behind.
# South UV corners are local (-x,+y), (+x,+y), (+x,-y), (-x,-y).
world=t.corners(cube)
corners=[world[i] for i in (6,7,5,4)]
normal=t.apply_matrix(t.cube_matrix(cube.get('rotation',[0,0,0])),[0,0,1])
assert normal[2]>0.9, 'The textured face must face the rear viewer'
screen=[(-p[0],p[1]) for p in corners]
left=min(range(4),key=lambda i:screen[i][0]-screen[i][1])
right=max(range(4),key=lambda i:screen[i][0]+screen[i][1])
assert screen[left][1]>screen[(left+3)%4][1] or screen[left][1]>screen[(left+1)%4][1]
uv_corners=[(0,0),(1,0),(1,1),(0,1)]
tl,tr=uv_corners[left],uv_corners[right]
assert tl[1]==tr[1]==0, 'Text rows must run downward from the upper edge'
face=cube['uv']['south']
seen=[]
for y in range(h):
    row=[]
    for x in range(w):
        u=tl[0]+(tr[0]-tl[0])*(x+0.5)/w
        v=(y+0.5)/h
        tx=int(face['uv'][0]+u*face['uv_size'][0])
        ty=int(face['uv'][1]+v*face['uv_size'][1])
        offset=(ty*layout.size[0]+tx)*4
        row.append(tuple(pixels[offset:offset+3])==(29,60,107))
    seen.append(row)
glyphs={
'M':['10001','11011','10101','10101','10001','10001','10001'],
'D':['11110','10001','10001','10001','10001','10001','11110'],
'R':['11110','10001','10001','11110','10100','10010','10001'],
'3':['01110','10001','00001','00110','00001','10001','01110'],
'9':['01110','10001','10001','01111','00001','10001','01110']}
expected=[[x in (0,w-1) or y in (0,h-1) for x in range(w)] for y in range(h)]
for text,top in [('MDR',3),('39',14)]:
    start=(w-(len(text)*6-1))//2
    for y in range(10):
        for index,char in enumerate(text):
            for x,bit in enumerate(glyphs[char][y*7//10]):
                expected[top+y][start+index*6+x]=bit=='1'
assert seen==expected, 'Rear plate bitmap must read MDR over 39 without reflection or inversion'
`);
  });
});
