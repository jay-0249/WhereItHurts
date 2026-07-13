"""Generate the WhereItHurts body meshes with Blender + MPFB2, headless.

Run (once per variant, after scripts/setup-mpfb.py):

    blender --background --python scripts/generate-bodies.py -- body-a
    blender --background --python scripts/generate-bodies.py -- body-b

Creates a default MPFB2 human, applies the variant's silhouette morphs
(subtle, silhouette-level only), strips helper/non-body objects, decimates
into the 10-20k triangle budget, and exports scripts/out/<variant>.glb.
scripts/verify-bodies.mjs then validates and copies into public/assets/.

MPFB2 outputs are CC0 (see ASSETS-LICENSE).
"""

import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

from bl_ext.user_default.mpfb.services.humanservice import HumanService
from bl_ext.user_default.mpfb.services.targetservice import TargetService

# Silhouette-level variant shaping. Two mechanisms, both audited in the
# script output:
#  - "macros" feed create_human's macro_detail_dict (gender is MPFB's native
#    shoulder:hip ratio control; cupsize drives the bust)
#  - "targets" are modeling morphs loaded as shape keys and baked; names are
#    bare (no directory) — TargetService.target_full_path resolves them
# body-a: masculine-leaning (broader shoulders, narrower hips).
# body-b: feminine-leaning (wider hips, bust, narrower shoulders).
# Everything else stays at MPFB defaults.
VARIANTS = {
    "body-a": {
        "macros": {"gender": 0.65},
        "targets": {
            "measure-shoulder-dist-incr": 0.6,
            "hip-scale-horiz-decr": 0.35,
        },
    },
    "body-b": {
        "macros": {"gender": 0.35, "cupsize": 0.65},
        "targets": {
            "hip-scale-horiz-incr": 0.6,
            "measure-shoulder-dist-decr": 0.35,
            "measure-bust-circ-incr": 0.3,
        },
    },
}

# ~35k budget: enough that hands/face/feet keep real geometry (15k
# collapsed the hand to a 0.03-unit blob in landmark measurement) and
# region boundaries quantize at ~1cm. The base mesh is only ~27k tris, so
# a level-1 subdivision (-> ~107k, also smoothing the surface) runs before
# decimation.
TRI_TARGET = 35000
TRI_MIN, TRI_MAX = 30000, 40000
OUT_DIR = Path(__file__).resolve().parent / "out"


# Arms near-vertical but with a clear gap off the torso: tap-friendly, and
# the landmark measurement needs an x-gap to separate arm from torso slices
# (at 8 deg the fuller-hipped build's arms fuse against its body).
ARM_TARGET_DEG = 12.0


def arm_angle_from_vertical(arm_obj, bone_name: str) -> float:
    pose_bone = arm_obj.pose.bones[bone_name]
    head = arm_obj.matrix_world @ pose_bone.head
    tail = arm_obj.matrix_world @ pose_bone.tail
    direction = (tail - head).normalized()
    dot = max(-1.0, min(1.0, direction.dot(Vector((0, 0, -1)))))
    return math.degrees(math.acos(dot))


def rotate_pose_bone_about_y(arm_obj, bone_name: str, degrees_: float) -> None:
    pose_bone = arm_obj.pose.bones[bone_name]
    pivot = pose_bone.matrix.to_translation()
    rotation = Matrix.Rotation(math.radians(degrees_), 4, "Y")
    pose_bone.matrix = (
        Matrix.Translation(pivot) @ rotation @ Matrix.Translation(-pivot)
        @ pose_bone.matrix
    )
    bpy.context.view_layer.update()


def pose_arms_down(arm_obj) -> None:
    """MPFB's default human stands in an A-pose; bring the arms close to
    vertical. Rotation sign is verified by measuring, so left/right and
    axis conventions can't silently invert."""
    for bone_name in ("upperarm01.L", "upperarm01.R"):
        before = arm_angle_from_vertical(arm_obj, bone_name)
        delta = before - ARM_TARGET_DEG
        rotate_pose_bone_about_y(arm_obj, bone_name, delta)
        after = arm_angle_from_vertical(arm_obj, bone_name)
        if after > ARM_TARGET_DEG + abs(delta) * 0.5:
            rotate_pose_bone_about_y(arm_obj, bone_name, -2 * delta)
            after = arm_angle_from_vertical(arm_obj, bone_name)
        print(f"{bone_name}: {before:.1f} deg -> {after:.1f} deg from vertical")


def evaluated_tri_count(obj) -> int:
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = obj.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    count = len(mesh.loop_triangles)
    evaluated.to_mesh_clear()
    return count


def evaluated_dimensions(obj):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = obj.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    xs = [v.co.x for v in mesh.vertices]
    ys = [v.co.y for v in mesh.vertices]
    zs = [v.co.z for v in mesh.vertices]
    dims = (max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs))
    evaluated.to_mesh_clear()
    return dims


def main() -> None:
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    if len(args) != 1 or args[0] not in VARIANTS:
        sys.exit(f"usage: ... -- <{'|'.join(VARIANTS)}>")
    variant = args[0]
    spec = VARIANTS[variant]

    # empty scene (keep session prefs/extensions intact)
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)

    # 1. human with the variant's macro settings applied at creation time,
    #    BEFORE any finalization/decimation/export; mask_helpers adds a Mask
    #    modifier that strips the clothes-helper geometry on export
    macro_dict = TargetService.get_default_macro_info_dict()
    macro_dict.update(spec.get("macros", {}))
    print(f"macro_detail_dict: {macro_dict}")
    basemesh = HumanService.create_human(macro_detail_dict=macro_dict)
    if basemesh is None:
        candidates = [o for o in bpy.data.objects if o.type == "MESH"]
        if len(candidates) != 1:
            sys.exit(f"FATAL: cannot identify basemesh among {candidates}")
        basemesh = candidates[0]
    print(f"created human: {basemesh.name}")

    # 2. variant morphs, baked into the mesh so export needs no shape keys
    for target_name, weight in spec["targets"].items():
        full_path = TargetService.target_full_path(target_name)
        if not full_path:
            sys.exit(f"FATAL: target not found: {target_name}")
        TargetService.load_target(basemesh, full_path, weight=weight, name=target_name)
    # audit: report the actual shape key values before baking
    if basemesh.data.shape_keys:
        for key_block in basemesh.data.shape_keys.key_blocks:
            if key_block.name != "Basis":
                print(f"shape key {key_block.name!r} value={key_block.value:.3f}")
    if spec["targets"]:
        TargetService.bake_targets(basemesh)
        print("targets baked")

    # 2b. pose arms down (default MPFB human is A-posed), bake the deform
    #     into the mesh, then the rig gets removed with the non-body sweep
    armature = HumanService.add_builtin_rig(basemesh, "default")
    pose_arms_down(armature)
    bpy.ops.object.select_all(action="DESELECT")
    basemesh.select_set(True)
    bpy.context.view_layer.objects.active = basemesh
    for mod in [m for m in basemesh.modifiers if m.type == "ARMATURE"]:
        bpy.ops.object.modifier_apply(modifier=mod.name)
    print("armature deform baked into mesh")

    # 3. remove everything that is not the body mesh
    removed = []
    for obj in list(bpy.data.objects):
        if obj is not basemesh:
            removed.append(f"{obj.name} ({obj.type})")
            bpy.data.objects.remove(obj, do_unlink=True)
    print(f"removed non-body objects: {removed if removed else 'none'}")

    # 4. subdivide (smooths + densifies past the ~27k source), then
    #    decimate into budget (ratio ~ output/input for collapse mode)
    subdiv = basemesh.modifiers.new("Subdiv", "SUBSURF")
    subdiv.levels = 1
    subdiv.render_levels = 1
    tris_before = evaluated_tri_count(basemesh)
    modifier = basemesh.modifiers.new("Decimate", "DECIMATE")
    modifier.ratio = min(1.0, TRI_TARGET / tris_before)
    tris = evaluated_tri_count(basemesh)
    if not TRI_MIN <= tris <= TRI_MAX:
        modifier.ratio = min(1.0, modifier.ratio * (TRI_TARGET / tris))
        tris = evaluated_tri_count(basemesh)
    if not TRI_MIN <= tris <= TRI_MAX:
        sys.exit(f"FATAL: triangle count {tris} outside {TRI_MIN}-{TRI_MAX}")
    print(f"triangles: {tris_before} -> {tris} (ratio {modifier.ratio:.4f})")
    print(f"dimensions (x,y,z): {evaluated_dimensions(basemesh)}")

    # 5. export GLB: modifiers applied, normals on, no UVs/materials/skin/anim
    OUT_DIR.mkdir(exist_ok=True)
    out_path = OUT_DIR / f"{variant}.glb"
    bpy.ops.object.select_all(action="DESELECT")
    basemesh.select_set(True)
    bpy.context.view_layer.objects.active = basemesh
    bpy.ops.export_scene.gltf(
        filepath=str(out_path),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_normals=True,
        export_texcoords=False,
        export_materials="NONE",
        export_skins=False,
        export_animations=False,
        export_morph=False,
    )
    print(f"exported {out_path}")


if __name__ == "__main__":
    main()
