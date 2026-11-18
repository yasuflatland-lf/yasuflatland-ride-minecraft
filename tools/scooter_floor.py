"""Floor edge, rails, and treads in the spike frame."""

import math

from tool_loader import load_tool

D = load_tool("scooter_dims")
kit = load_tool("scooter_kit")
atlas = load_tool("scooter_atlas")
AREA = "floor"
BONE = "body"

def register_regions(registry):
    existing = {r.name for r in registry.regions()}
    for name,material,color in (("body_tread",atlas.Material.RUBBER,D.BODY_TREAD_COLOR),
                                ("body_edge",atlas.Material.CHROME,D.BODY_EDGE_COLOR),
                                ("body_rail",atlas.Material.CHROME,D.BODY_EDGE_COLOR)):
        if name not in existing:
            registry.register(atlas.Region(name,atlas.SMALL_TEXELS,atlas.SMALL_TEXELS,material,
                                           lambda u,v,c=color:(*c,255)))


def build() -> kit.AreaCubes:
    register_regions(atlas.REGISTRY)
    result = kit.AreaCubes()
    layout = D.FLOOR_STRIPS
    y = layout["chrome_y"]
    front = min(layout["front_z"])
    edge = layout["edge_x"]
    chrome = atlas.faces("body_rail")
    edge_chrome = atlas.faces("body_edge")
    rubber = atlas.faces("body_tread")
    lip_height = layout["chrome_lip_height"]
    core_y = y + lip_height/2 - layout["groove_depth"] - layout["rubber_height"]/2

    def rail(x, front, rear):
        def section(lo, hi, scale):
            for width_scale,height_scale in layout["rail_sections"]:
                width = layout["chrome_lip_width"]*width_scale*scale
                height = lip_height*height_scale*scale
                result.add(BONE,kit.box((x-width/2,y-height/2,lo),
                                        (x+width/2,y+height/2,hi),chrome),"body_floor")

        section(front,rear,1)
        for end,sign in ((front,-1),(rear,1)):
            for step in range(layout["cap_steps"]):
                a = step/layout["cap_steps"]
                b = (step+1)/layout["cap_steps"]
                scale = math.sqrt(1-((a+b)/2)**2)
                ends = (end+sign*a*layout["cap_length"],end+sign*b*layout["cap_length"])
                section(min(ends),max(ends),scale)

    def composite(x, front, rear):
        offset = (layout["rubber_width"]+layout["chrome_lip_width"])/2
        for dx in (-offset,offset):
            rail(x+dx,front,rear)
        result.add(BONE,kit.box((x-layout["rubber_width"]/2,core_y-layout["rubber_height"]/2,front),
                                (x+layout["rubber_width"]/2,core_y+layout["rubber_height"]/2,rear),rubber),
                   "body_floor")

    def curl(x):
        return kit.spline(((x,y,front),
                           (x,y+layout["front_curl_rise"]*layout["front_curl_control"][1],
                            front-layout["front_curl_length"]*layout["front_curl_control"][0]),
                           (x,y+layout["front_curl_rise"],front-layout["front_curl_length"])),
                          layout["curve_steps"]//2)

    for side in (-1,1):
        result.add(BONE,kit.tube([(side*x,ey,z) for x,ey,z in
                                 kit.spline(D.FLOOR_LOWER_EDGE,layout["curve_steps"])],
                                 layout["lower_edge_size"],edge_chrome,assembly="body_floor"))
        for x,rail_front,rear in zip(layout["x_centres"],layout["front_z"],layout["rear_z"]):
            composite(side*x,rail_front,rear)
        rear = max(layout["rear_z"])
        tab_end = rear + layout["rear_tab_length"]
        edge_path = [*reversed(curl(side*edge)),(side*edge,y,rear),
                     (side*edge,y+layout["rear_tab_rise"],rear+layout["rear_tab_run"]),
                     (side*edge,y+layout["rear_tab_rise"],tab_end),
                     (side*layout["panel_inner_x"],y+layout["rear_tab_rise"],tab_end)]
        result.add(BONE,kit.tube(edge_path,layout["edge_size"],edge_chrome,assembly="body_floor"))
        # The trim needs a painted backing above the existing flat deck at both ends.
        front_profile = curl(side*edge)
        rear_profile = [(side*edge,y,rear),
                        (side*edge,y+layout["rear_tab_rise"],rear+layout["rear_tab_run"]),
                        (side*edge,y+layout["rear_tab_rise"],tab_end)]
        for profile in (front_profile,rear_profile):
            rings = [[(side*layout["panel_inner_x"],py-lip_height/2,pz),
                      (side*edge,py-lip_height/2,pz)] for _,py,pz in profile]
            result.add(BONE,kit.skin(rings,layout["panel_thickness"],atlas.faces("paint"),
                                    inside=(0,D.BODY_DECK_Y-layout["backing_inside_drop"],front),assembly="body_floor"))
    return result
