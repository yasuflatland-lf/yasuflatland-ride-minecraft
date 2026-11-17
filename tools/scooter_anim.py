"""Scooter motion and sound animations in the Bedrock rotation convention."""

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tool_loader import load_tool

dims = load_tool("scooter_dims")


def build():
    c = math.cos(math.radians(dims.STEERING_AXIS_DEGREES))
    s = math.sin(math.radians(dims.STEERING_AXIS_DEGREES))
    steer = "query.property('yasu_ride:steer')"
    sine, cosine = f"math.sin({steer})", f"math.cos({steer})"
    rotation = [
        f"-math.atan2({c*s:.6f}*(1 - {cosine}), {s*s:.6f} + {c*c:.6f}*{cosine})",
        f"-math.asin({c:.6f}*{sine})",
        f"math.atan2({s:.6f}*{sine}, {cosine})",
    ]
    wheel = f"-query.modified_distance_moved * {180/math.pi/(dims.TYRE_RADIUS/dims.MODEL_PIXELS_PER_BLOCK):.6f}"
    folds = ("wheel_front_fold", "wheel_rear_fold")
    down, flat, zero = [0, -dims.FOLD_DROP, 0], [0, 0, dims.FOLD_DEGREES], [0, 0, 0]
    start = str(dims.FOLD_LAY_START)
    reverse = str(round(1 - dims.FOLD_LAY_START, 6))
    animations = {
        "wheels": {"loop": True, "bones": {name: {"rotation": [wheel, 0, 0]}
                   for name in ("wheel_front", "wheel_rear")}},
        "steer": {"loop": True, "bones": {"steer": {"rotation": rotation}}},
        "lean": {"loop": True, "bones": {"root": {"rotation": [0, 0,
                 "query.property('yasu_ride:lean') - query.property('yasu_ride:bank')"]}}},
        "stand_up": {"loop": True, "bones": {"stand": {"rotation": [dims.STAND_UP_DEGREES, 0, 0]}}},
        "wheels_deploy": {"animation_length": dims.FOLD_SECONDS,
            "sound_effects": {"0.0": {"effect": "hover_start"}},
            "bones": {name: {"position": {"0.0": zero, start: down, "1.0": down},
                             "rotation": {"0.0": zero, start: zero, "1.0": flat}} for name in folds}},
        "wheels_folded": {"loop": True, "bones": {
            name: {"position": down, "rotation": flat} for name in folds}},
        "wheels_retract": {"animation_length": dims.FOLD_SECONDS, "bones": {
            name: {"position": {"0.0": down, reverse: down, "1.0": zero},
                   "rotation": {"0.0": flat, reverse: zero, "1.0": zero}} for name in folds}},
        "hover_glow": {"loop": True, "animation_length": dims.GLOW_SECONDS,
            "particle_effects": {"0.0": [{"effect": "hover_glow", "locator": "hover_" + side}
                                         for side in ("front", "rear")]}},
    }
    for family, count in (("engine", dims.ENGINE_SOUND_COUNT), ("hover", dims.HOVER_SOUND_COUNT)):
        for i in range(count):
            animations[f"{family}_sound_{i}"] = {
                "loop": True, "animation_length": dims.SOUND_LOOP_SECONDS,
                "sound_effects": {"0.0": {"effect": f"{family}_{i}"}}}
    return {"format_version": "1.8.0", "animations": {
        "animation.yasu_ride.scooter." + name: value for name, value in animations.items()}}
