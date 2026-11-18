"""Floor edge, rails, and treads in the spike frame."""

from tool_loader import load_tool

D = load_tool("scooter_dims")
kit = load_tool("scooter_kit")
atlas = load_tool("scooter_atlas")
AREA = "floor"
BONE = "body"

FLOOR_EDGE = ((4.3,4.4322,-4.0338),(4.02,4.48,-3.5),(4.08,4.56,-2.5),
              (4.08,4.56,0),(4.08,4.59,3),(3.94,4.95,3.7),(3.8,5.32,4))



def register_regions(registry):
    existing = {r.name for r in registry.regions()}
    for name,material,color in (("body_tread",atlas.Material.RUBBER,D.BODY_TREAD_COLOR),
                                ("body_edge",atlas.Material.CHROME,D.BODY_EDGE_COLOR)):
        if name not in existing:
            registry.register(atlas.Region(name,atlas.SMALL_TEXELS,atlas.SMALL_TEXELS,material,
                                           lambda u,v,c=color:(*c,255)))


def build() -> kit.AreaCubes:
    register_regions(atlas.REGISTRY)
    result = kit.AreaCubes()
    for side in (-1,1):
        result.add(BONE,kit.tube([(side*x,y,z) for x,y,z in kit.spline(FLOOR_EDGE,D.BODY_FLOOR_EDGE_STEPS)],
                                 D.BODY_FLOOR_EDGE_SIZE,atlas.faces("body_edge"),assembly="body_floor"))
    for x in D.BODY_RAIL_X:
        rise = []
        for i in range(D.BODY_RAIL_STEPS+1):
            y = D.BODY_RAIL_Y+D.BODY_RAIL_RISE*(i/D.BODY_RAIL_STEPS)**2
            rise.append((x,y,kit.shield_z(x,y)+D.BODY_RAIL_SHIELD_OFFSET))
        result.add(BONE,kit.tube([(x,D.BODY_RAIL_Y,D.BODY_RAIL_REAR),(x,D.BODY_RAIL_Y,D.BODY_RAIL_FRONT),*rise],
                                 D.BODY_RAIL_SIZE,atlas.faces("chrome"),assembly="body_floor"))
        result.add(BONE,kit.box((x-D.BODY_TREAD_HALF_WIDTH,D.BODY_TREAD_BOTTOM,D.BODY_TREAD_FRONT),
                                (x+D.BODY_TREAD_HALF_WIDTH,D.BODY_TREAD_TOP,D.BODY_TREAD_REAR),
                                atlas.faces("body_tread")),"body_floor")
    return result
