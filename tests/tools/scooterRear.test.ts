import { afterAll, describe, it } from "vitest";
import { startPythonWorker } from "../support/pythonWorker";

const python = startPythonWorker();
afterAll(() => python.close());

describe("scooter rear plate", () => {
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
