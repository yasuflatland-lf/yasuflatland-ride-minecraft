"""Floor edge, rails, and treads in the spike frame."""

from tool_loader import load_tool

D = load_tool("scooter_dims")
kit = load_tool("scooter_kit")
atlas = load_tool("scooter_atlas")
AREA = "floor"
BONE = "body"

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
    layout = D.FLOOR_STRIPS
    y = layout["chrome_y"]
    front = layout["front_z"]
    edge = layout["edge_x"]
    chrome = atlas.faces("chrome")
    rubber = atlas.faces("body_tread")
    lip_height = layout["chrome_lip_height"]
    core_y = y + lip_height/2 - layout["groove_depth"] - layout["rubber_height"]/2

    def rivet(point):
        half = layout["rivet_size"]/2
        result.add(BONE,kit.box(tuple(v-half for v in point),
                                tuple(v+half for v in point),chrome),"body_floor")

    def composite(x, rear, extension):
        # Separate lips leave the recessed rubber visible instead of hiding it under a chrome face.
        offset = (layout["rubber_width"]+layout["chrome_lip_width"])/2
        for dx,width,height,cy,faces in (
                (-offset,layout["chrome_lip_width"],lip_height,y,chrome),
                (offset,layout["chrome_lip_width"],lip_height,y,chrome),
                (0,layout["rubber_width"],layout["rubber_height"],core_y,rubber)):
            result.add(BONE,kit.box((x+dx-width/2,cy-height/2,front),
                                    (x+dx+width/2,cy+height/2,rear),faces),"body_floor")
            cubes = kit.tube(extension,height,faces,assembly="body_floor")
            for cube in cubes:
                cube["origin"][0] += dx + (height-width)/2
                cube["size"][0] = width
                cube["origin"][1] += cy-y
            result.add(BONE,cubes)
        rivet((x,y,rear))
        rivet(extension[-1])

    def curl(x):
        return kit.spline(((x,y,front),
                           (x,y-layout["front_curl_drop"]/3,front-layout["front_curl_length"]*.7),
                           (x,y-layout["front_curl_drop"],front-layout["front_curl_length"])),
                          layout["curve_steps"]//2)

    for side in (-1,1):
        result.add(BONE,kit.tube([(side*x,ey,z) for x,ey,z in
                                 kit.spline(D.FLOOR_LOWER_EDGE,layout["curve_steps"])],
                                 layout["lower_edge_size"],chrome,assembly="body_floor"))
        for index,(x,rear) in enumerate(zip(layout["x_centres"],layout["rear_z"])):
            x *= side
            if index == 0:
                rise = [y+layout["shield_rise"]*(i/layout["shield_steps"])**2
                        for i in range(layout["shield_steps"]+1)]
                extension = [(x,y,front),*((x,sy,kit.shield_z(x,sy)+layout["shield_offset"])
                                         for sy in rise)]
            else:
                extension = curl(x)
            composite(x,rear,extension)
        rear = max(layout["rear_z"])
        tab_end = rear + layout["rear_tab_length"]
        edge_path = [*reversed(curl(side*edge)),(side*edge,y,rear),
                     (side*edge,y-layout["rear_tab_drop"],rear),
                     (side*edge,y-layout["rear_tab_drop"],tab_end)]
        result.add(BONE,kit.tube(edge_path,layout["edge_size"],chrome,assembly="body_floor"))
    return result
