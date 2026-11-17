"""Scooter motion and sound animations in the Bedrock rotation convention."""

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tool_loader import load_tool

dims = load_tool("scooter_dims")
sound = load_tool("scooter_sound")


def fold_position_keys(clip):
    """Drop keys for "deploy", "folded" or "retract"; "folded" is the constant vector."""
    down, zero = [0, -dims.FOLD_DROP, 0], [0, 0, 0]
    if clip == "deploy":
        return {"0.0": zero, str(dims.FOLD_LAY_START): down, "1.0": down}
    if clip == "folded":
        return down
    if clip == "retract":
        return {"0.0": down, str(round(1 - dims.FOLD_LAY_START, 6)): down, "1.0": zero}
    raise ValueError(f"Unknown fold clip: {clip}")


def fold_rotation_keys(clip):
    """Roll keys for "deploy", "folded" or "retract"; "folded" is the constant vector."""
    flat, zero = [0, 0, dims.FOLD_DEGREES], [0, 0, 0]
    if clip == "deploy":
        return {"0.0": zero, str(dims.FOLD_LAY_START): zero, "1.0": flat}
    if clip == "folded":
        return flat
    if clip == "retract":
        return {"0.0": flat, str(round(1 - dims.FOLD_LAY_START, 6)): zero, "1.0": zero}
    raise ValueError(f"Unknown fold clip: {clip}")


def _fold_bones(clip):
    return {name: {"position": fold_position_keys(clip), "rotation": fold_rotation_keys(clip)}
            for name in dims.FOLD_BONES.values()}


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
    animations = {
        "wheels": {"loop": True, "bones": {name: {"rotation": [wheel, 0, 0]}
                   for name in ("wheel_front", "wheel_rear")}},
        "steer": {"loop": True, "bones": {"steer": {"rotation": rotation}}},
        "lean": {"loop": True, "bones": {"root": {"rotation": [0, 0,
                 "query.property('yasu_ride:lean') - query.property('yasu_ride:bank')"]}}},
        "stand_up": {"loop": True, "bones": {"stand": {"rotation": [dims.STAND_UP_DEGREES, 0, 0]}}},
        "wheels_deploy": {"animation_length": dims.FOLD_SECONDS,
            "sound_effects": {"0.0": {"effect": "hover_start"}},
            "bones": _fold_bones("deploy")},
        "wheels_folded": {"loop": True, "bones": _fold_bones("folded")},
        "wheels_retract": {"animation_length": dims.FOLD_SECONDS, "bones": _fold_bones("retract")},
        "hover_glow": {"loop": True, "animation_length": dims.GLOW_SECONDS,
            "particle_effects": {"0.0": [{"effect": "hover_glow", "locator": "hover_" + side}
                                         for side in ("front", "rear")]}},
    }
    for clip in sound.ENGINE_CLIPS:
        animations[f"engine_sound_{clip.index}"] = {
            "loop": True, "animation_length": clip.seconds,
            "sound_effects": {"0.0": {"effect": sound.engine_effect(clip.index)}}}
    for i in range(dims.HOVER_SOUND_COUNT):
        animations[f"hover_sound_{i}"] = {
            "loop": True, "animation_length": dims.HOVER_LOOP_SECONDS,
            "sound_effects": {"0.0": {"effect": f"hover_{i}"}}}
    return {"format_version": "1.8.0", "animations": {
        "animation.yasu_ride.scooter." + name: value for name, value in animations.items()}}
