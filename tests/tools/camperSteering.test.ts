import fc from "fast-check";
import { afterAll, describe, expect, it } from "vitest";
import { startPythonWorker } from "../support/pythonWorker";

const python = startPythonWorker();
afterAll(() => python.close());
const setup = `import json, sys
from dataclasses import replace
sys.path.insert(0, 'tools')
from tool_loader import load_tool
kit=load_tool('camper_kit')
dash=load_tool('camper_dash').DASH_GEOMETRY
m=load_tool('camper_steering')
`;

describe("camper steering builder", () => {
  it("puts the 30-cube gear lever on the static body with the approved rod lengths", async () => {
    const result = JSON.parse(
      await python.run(`${setup}
a=m.build_steering(dash,kit.REGISTRY)
print(json.dumps(dict(bones=list(a), wheel=len(a['steering']), body=len(a['body']), rods=[c['size'][0] for c in a['body'][2:4]])))`),
    );
    expect(result.bones.sort()).toEqual(["body", "steering"]);
    expect(result.wheel).toBe(115);
    expect(result.body).toBe(32);
    expect(result.rods[0]).toBeCloseTo(5.46, 2);
    expect(result.rods[1]).toBeCloseTo(4.7, 2);
  });

  it("translates all steering and lever geometry with the dash descriptor", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.double({ min: -4, max: 4, noNaN: true }),
        async (dz) => {
          const result = JSON.parse(
            await python.run(`${setup}
a=m.build_steering(dash,kit.REGISTRY)
b=m.build_steering(replace(dash,face_origin=tuple(v+(${dz} if i==2 else 0) for i,v in enumerate(dash.face_origin)),column_entry=tuple(v+(${dz} if i==2 else 0) for i,v in enumerate(dash.column_entry))),kit.REGISTRY)
print(json.dumps(all(abs(y['origin'][2]-x['origin'][2]-${dz})<1e-8 and all(abs(a-b)<1e-8 for a,b in zip(x['size'],y['size'])) and x['uv']==y['uv'] for k in a for x,y in zip(a[k],b[k]))))`),
          );
          expect(result).toBe(true);
        },
      ),
      { numRuns: 15, examples: [[1], [-4], [4], [6.2990430649279006e-9]] },
    );
  }, 30_000);

  it("resolves every face inside a registered region without private atlas offsets", async () => {
    const result = JSON.parse(
      await python.run(`${setup}
a=m.build_steering(dash,kit.REGISTRY)
errors=[]
used=set()
for cs in a.values():
 for c in cs:
  for f in c['uv'].values():
   u,v=f['uv'];w,h=f['uv_size']
   matches=[r.name for r in kit.REGISTRY.regions() if kit.LAYOUT.origin(r.name)[0]<=min(u,u+w)<=max(u,u+w)<=kit.LAYOUT.origin(r.name)[0]+r.width and kit.LAYOUT.origin(r.name)[1]<=min(v,v+h)<=max(v,v+h)<=kit.LAYOUT.origin(r.name)[1]+r.height]
   used.update(matches)
   if not matches:errors.append(f)
print(json.dumps(dict(errors=errors, used=sorted(used), extra=[r.name for r in kit.REGISTRY.regions() if r.name.startswith('wheel ')])))`),
    );
    expect(result).toEqual({
      errors: [],
      used: ["base", "cab DARK19"],
      extra: [],
    });
  });
});
