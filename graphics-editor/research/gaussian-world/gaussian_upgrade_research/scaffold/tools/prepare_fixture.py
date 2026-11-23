#!/usr/bin/env python3
"""Prepare, never render, a deterministic CRF Gaussian calibration fixture.

Standard-library only. World coordinates: metres, Y up. Camera coordinates:
OpenCV x right, y down, z forward; integer pixel coordinates identify centres.
The 120 views and angular split are reused by every lighting configuration.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import tempfile


TARGET = (0.0, 0.5, 0.0)
ELEVATIONS = (15.0, 30.0, 50.0)
AZIMUTH_COUNT = 40
VAL_AZIMUTHS = frozenset(range(8, 12))
TEST_AZIMUTHS = frozenset(range(28, 32))
LIGHTING = (
    {"id": "neutral_top", "origin": [-1.5, 4.0, -1.0],
     "edge_u": [3.0, 0.0, 0.0], "edge_v": [0.0, 0.0, 2.0],
     "radiance_linear_rgb": [8.0, 8.0, 8.0]},
    {"id": "warm_left", "origin": [-3.0, 3.5, -1.0],
     "edge_u": [2.0, 0.0, 0.0], "edge_v": [0.0, 0.0, 2.0],
     "radiance_linear_rgb": [10.0, 7.0, 4.0]},
    {"id": "cool_right", "origin": [1.0, 3.5, -1.0],
     "edge_u": [2.0, 0.0, 0.0], "edge_v": [0.0, 0.0, 2.0],
     "radiance_linear_rgb": [5.0, 7.0, 10.0]},
)

GEOMETRY = """# CRF fixture geometry, metres, Y up, linear RGB
# Material: name type r g b roughness IOR texture scale bump
# Metal color is the renderer's metal reflectance parameter, not diffuse albedo.
# Glass color is Beer transmission per metre, not per-interface tint.
mat matte 0 0.55 0.08 0.05 0.5 1.5 0 1 0
mat metal 1 0.85 0.70 0.30 0.18 1.5 0 1 0
mat glass 2 0.97 0.995 0.99 0 1.5 0 1 0
mat ground 0 0.32 0.32 0.32 0.5 1.5 0 1 0
sphere matte -1.1 0.5 0 0.5
sphere metal 0 0.5 0 0.5
sphere glass 1.1 0.5 0 0.5
quad ground -6 0 6 12 0 0 0 0 -12
"""


def add(a, b):
    return tuple(x + y for x, y in zip(a, b))


def sub(a, b):
    return tuple(x - y for x, y in zip(a, b))


def mul(a, s):
    return tuple(x * s for x in a)


def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def cross(a, b):
    return (a[1] * b[2] - a[2] * b[1],
            a[2] * b[0] - a[0] * b[2],
            a[0] * b[1] - a[1] * b[0])


def norm(a):
    length = math.sqrt(dot(a, a))
    if length < 1e-12:
        raise ValueError("Degenerate vector")
    return mul(a, 1.0 / length)


def max_error(a, b):
    return max(abs(x - y) for x, y in zip(a, b))


def numbers(values):
    return " ".join(format(float(v), ".17g") for v in values)


def atomic_text(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=path.name + ".", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(text)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def write_json(path, data):
    atomic_text(path, json.dumps(data, indent=2, ensure_ascii=False,
                                allow_nan=False) + "\n")


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def view_split(azimuth_index):
    if azimuth_index in VAL_AZIMUTHS:
        return "val"
    if azimuth_index in TEST_AZIMUTHS:
        return "test"
    return "train"


def make_camera(elevation_index, azimuth_index, width, height, fov, radius):
    elevation = ELEVATIONS[elevation_index]
    azimuth = azimuth_index * 360.0 / AZIMUTH_COUNT
    el, az = math.radians(elevation), math.radians(azimuth)
    origin = add(TARGET, (radius * math.cos(el) * math.sin(az),
                          radius * math.sin(el),
                          radius * math.cos(el) * math.cos(az)))
    forward = norm(sub(TARGET, origin))
    right = norm(cross(forward, (0.0, 1.0, 0.0)))
    up = cross(right, forward)
    down = mul(up, -1.0)
    c2w = [[right[i], down[i], forward[i], origin[i]] for i in range(3)]
    c2w.append([0.0, 0.0, 0.0, 1.0])
    w2c = [[*axis, -dot(axis, origin)] for axis in (right, down, forward)]
    w2c.append([0.0, 0.0, 0.0, 1.0])
    focal = height / (2.0 * math.tan(math.radians(fov) / 2.0))
    k = [[focal, 0.0, (width - 1) / 2.0],
         [0.0, focal, (height - 1) / 2.0], [0.0, 0.0, 1.0]]
    view_id = f"e{elevation_index:02d}_a{azimuth_index:02d}"
    return {
        "id": view_id, "elevation_index": elevation_index,
        "azimuth_index": azimuth_index, "azimuth_degrees": azimuth,
        "elevation_degrees": elevation, "split": view_split(azimuth_index),
        "width": width, "height": height, "vertical_fov_degrees": fov,
        "aperture_radius_metres": 0.0, "focus_distance_metres": radius,
        "origin_world": list(origin), "target_world": list(TARGET),
        "K": k, "c2w_opencv": c2w, "w2c_opencv": w2c,
        "crf_camera_line": "camera " + numbers((*origin, *TARGET, fov, 0.0, radius)),
        "scene_paths": {light["id"]: f"scenes/{light['id']}/{view_id}.scene"
                        for light in LIGHTING},
        "output_prefixes": {light["id"]: f"renders/{light['id']}/{view_id}"
                            for light in LIGHTING},
    }


def lighting_dsl(light):
    return ("# Uniform low-level fill environment; no sun, fog or texture assets\n"
            "env 0.6 0.7 0.9 0.6 0.7 0.9 0.025\n"
            "mat emitter 3 " + numbers(light["radiance_linear_rgb"]) +
            " 0 1.5 0 1 0\nquad emitter " +
            numbers((*light["origin"], *light["edge_u"], *light["edge_v"])) + "\n")


def validate(cameras, width, height, fov):
    failures = []
    maxima = {"rotation_orthogonality": 0.0, "rotation_determinant_error": 0.0,
              "inverse_matrix_error": 0.0, "target_projection_error_pixels": 0.0,
              "opencv_vs_crf_ray_error": 0.0, "ray_distance_to_z_error": 0.0}
    counts = {split: sum(c["split"] == split for c in cameras)
              for split in ("train", "val", "test")}
    if len(cameras) != 120 or counts != {"train": 96, "val": 12, "test": 12}:
        failures.append("Invalid camera or split counts")
    for c in cameras:
        m, inverse, k = c["c2w_opencv"], c["w2c_opencv"], c["K"]
        axes = [tuple(m[r][column] for r in range(3)) for column in range(3)]
        for i in range(3):
            for j in range(3):
                maxima["rotation_orthogonality"] = max(
                    maxima["rotation_orthogonality"],
                    abs(dot(axes[i], axes[j]) - (1.0 if i == j else 0.0)))
        maxima["rotation_determinant_error"] = max(
            maxima["rotation_determinant_error"], abs(dot(axes[0], cross(axes[1], axes[2])) - 1))
        for i in range(4):
            for j in range(4):
                value = sum(inverse[i][t] * m[t][j] for t in range(4))
                maxima["inverse_matrix_error"] = max(
                    maxima["inverse_matrix_error"], abs(value - (1.0 if i == j else 0.0)))
        relative = sub(TARGET, c["origin_world"])
        cam = tuple(dot(axis, relative) for axis in axes)
        if cam[2] <= 0:
            failures.append(c["id"] + ": target behind camera")
        projected = (k[0][0] * cam[0] / cam[2] + k[0][2],
                     k[1][1] * cam[1] / cam[2] + k[1][2])
        maxima["target_projection_error_pixels"] = max(
            maxima["target_projection_error_pixels"],
            max_error(projected, ((width - 1) / 2, (height - 1) / 2)))
        half_height = math.tan(math.radians(fov) / 2)
        half_width = half_height * width / height
        for x in (0.0, (width - 1) / 2, width - 1.0):
            for y in (0.0, (height - 1) / 2, height - 1.0):
                ray_camera = norm(((x - k[0][2]) / k[0][0],
                                   (y - k[1][2]) / k[1][1], 1.0))
                opencv_world = tuple(sum(m[r][i] * ray_camera[i] for i in range(3))
                                     for r in range(3))
                # Independent expression copied mathematically from CRF's centre-ray convention.
                px = (2 * (x + 0.5) / width - 1) * half_width
                py = (1 - 2 * (y + 0.5) / height) * half_height
                crf_world = norm(add(add(axes[2], mul(axes[0], px)), mul(axes[1], -py)))
                maxima["opencv_vs_crf_ray_error"] = max(
                    maxima["opencv_vs_crf_ray_error"], max_error(opencv_world, crf_world))
                distance = 3.25
                z_from_hit = dot(axes[2], mul(opencv_world, distance))
                z_from_formula = distance / math.sqrt(
                    1 + ((x-k[0][2])/k[0][0])**2 + ((y-k[1][2])/k[1][1])**2)
                maxima["ray_distance_to_z_error"] = max(
                    maxima["ray_distance_to_z_error"], abs(z_from_hit - z_from_formula))
        for centre in ((-1.1, 0.5, 0.0), (0.0, 0.5, 0.0), (1.1, 0.5, 0.0)):
            for dx in (-0.5, 0.5):
                for dy in (-0.5, 0.5):
                    for dz in (-0.5, 0.5):
                        point = sub(add(centre, (dx, dy, dz)), c["origin_world"])
                        p = tuple(dot(axis, point) for axis in axes)
                        u = k[0][0] * p[0] / p[2] + k[0][2]
                        v = k[1][1] * p[1] / p[2] + k[1][2]
                        if p[2] <= 0 or not (-0.5 <= u <= width-0.5 and -0.5 <= v <= height-0.5):
                            failures.append(c["id"] + ": sphere bounds outside frustum")
        if c["split"] != view_split(c["azimuth_index"]):
            failures.append(c["id"] + ": split mismatch")
        if set(c["scene_paths"]) != {light["id"] for light in LIGHTING}:
            failures.append(c["id"] + ": lighting groups missing")
    if any(value > 1e-9 for value in maxima.values()):
        failures.append("Camera numerical tolerance exceeded")
    return {"passed": not failures, "camera_count": len(cameras), "split_counts": counts,
            "lighting_group_count": len(LIGHTING), "reused_view_split_for_all_lights": True,
            "render_scene_count": len(cameras) * len(LIGHTING),
            "test_pixels_per_camera": 9, "sphere_bounds_checked": True,
            "max_errors": maxima, "absolute_tolerance": 1e-9,
            "failures": failures, "rendered": False, "trained": False,
            "gpu_started": False,
            "scope": "Analytical camera/projection/data preparation validation only; no rendered image comparison."}


def prepare(args):
    destination = args.output.resolve()
    if destination.exists() and any(destination.iterdir()):
        raise ValueError("Output directory is not empty; choose a new directory to preserve existing fixtures")
    if args.width < 32 or args.height < 32 or not (20 <= args.fov <= 100) or args.radius < 4:
        raise ValueError("Use width/height >=32, vertical FOV in [20,100], radius >=4 metres")
    cameras = [make_camera(e, a, args.width, args.height, args.fov, args.radius)
               for e in range(3) for a in range(AZIMUTH_COUNT)]
    validation = validate(cameras, args.width, args.height, args.fov)
    if not validation["passed"]:
        raise ValueError("Validation failed before writing: " + str(validation["failures"]))
    destination.mkdir(parents=True, exist_ok=True)
    conventions = {
        "world_units": "metres", "world_up": "+Y", "world_handedness": "right",
        "camera_axes": "OpenCV: +X right, +Y down, +Z forward",
        "c2w_storage": "row-major 4x4; columns 0..2 are camera axes in world; column 3 is position",
        "transform_rule": "world_homogeneous = c2w_opencv @ camera_homogeneous",
        "pixel_coordinates": "integer (u,v) are pixel centres; top-left centre=(0,0)",
        "image_edges": "u in [-0.5,width-0.5]; v in [-0.5,height-0.5]",
        "intrinsics": "fx=fy=height/(2*tan(vfov/2)); cx=(width-1)/2; cy=(height-1)/2",
        "vertical_fov": "angle between top and bottom image edges, not between outermost pixel centres",
        "crf_pixel_equivalence": "CRF samples at (x+0.5,y+0.5) in image-edge coordinates; integer-centre OpenCV K above is equivalent",
        "lens": "pinhole, aperture=0, no distortion, global shutter",
        "image_array": "top-to-bottom rows; PFM file storage is bottom-to-top and must be flipped when decoded",
    }
    split_spec = {
        "method": "contiguous azimuth blocks withheld across all elevations; not random adjacent-frame splitting",
        "azimuth_count": 40, "step_degrees": 9.0,
        "val_azimuth_indices": sorted(VAL_AZIMUTHS), "test_azimuth_indices": sorted(TEST_AZIMUTHS),
        "train_count": 96, "val_count": 12, "test_count": 12,
        "elevations_degrees": list(ELEVATIONS), "guard_gap": "none; boundary neighbours can be 9 degrees apart",
        "lighting_split": "same view labels for every lighting group; all lights are provided, not a held-out-light benchmark",
    }
    aov = {
        "beauty": {"implemented": True, "suffix": ".pfm", "meaning": "linear RGB path-traced estimate before display filtering"},
        "albedo": {"implemented": True, "suffix": "_albedo.pfm", "meaning": "first pinhole hit material color: diffuse reflectance for matte/ground; metal reflectance parameter for metal; Beer transmission per metre for glass; not universal diffuse albedo"},
        "normal": {"implemented": True, "suffix": "_normal.pfm", "meaning": "world-space face-forward first-hit surface/shading normal encoded n*0.5+0.5; no bump in this fixture; not camera-space normal"},
        "depth": {"implemented": True, "suffix": "_depth.pfm", "meaning": "first-hit normalized-ray distance t in metres repeated in RGB; not camera-Z; zero on miss", "to_opencv_z": "Z=t/sqrt(1+((u-cx)/fx)^2+((v-cy)/fy)^2)"},
        "direct": {"implemented": False}, "indirect": {"implemented": False},
        "specular": {"implemented": False}, "diffuse_component": {"implemented": False},
        "material_id": {"implemented": False}, "brdf_parameter_images": {"implemented": False},
    }
    metadata = {
        "schema": "crf.procedural_fixture.v1", "status": "prepared_not_rendered_or_trained",
        "content_origin": "procedural geometry and analytic materials only; no photos, external meshes or pretrained weights",
        "width": args.width, "height": args.height, "radius_metres": args.radius,
        "vertical_fov_degrees": args.fov, "target_world": list(TARGET),
        "camera_conventions": conventions, "split": split_spec,
        "geometry": {"spheres": 3, "ground_quads": 1, "emitter_quads_per_light_group": 1,
                     "renderer_primitive_count": 7, "material_count": 5,
                     "geometry_scene_role": "standalone CRF scene using first view and neutral_top lighting"},
        "lighting": list(LIGHTING), "environment_intensity": 0.025,
        "aov_contract": aov,
        "limitations": ["No rendering, training, GPU measurement or perceptual-quality claim has occurred.",
                        "The existing renderer is a prototype; its output is a reference implementation, not automatically physical ground truth.",
                        "Sphere geometry, camera matrices and declared material parameters are exact fixture inputs; transport remains a sampled numerical estimate.",
                        "Direct/indirect/specular separation required by advanced reflection research is not implemented in the existing renderer.",
                        "Camera and view split stay identical across lights; define an additional held-out lighting protocol before claiming relighting generalization."],
    }
    write_json(destination / "metadata.json", metadata)
    write_json(destination / "cameras.json", {"schema": "crf.cameras.opencv.v1", "conventions": conventions, "split": split_spec, "views": cameras})
    write_json(destination / "validation.json", validation)
    atomic_text(destination / "geometry.scene", cameras[0]["crf_camera_line"] + "\n" + GEOMETRY + lighting_dsl(LIGHTING[0]))
    jobs = []
    for light in LIGHTING:
        for camera in cameras:
            relative = camera["scene_paths"][light["id"]]
            atomic_text(destination / relative, camera["crf_camera_line"] + "\n" + GEOMETRY + lighting_dsl(light))
            jobs.append({"view_id": camera["id"], "lighting_id": light["id"], "split": camera["split"],
                         "scene": relative, "output_prefix": camera["output_prefixes"][light["id"]],
                         "width": args.width, "height": args.height,
                         "status": "not_rendered"})
    write_json(destination / "render_jobs.json", {
        "status": "descriptions_only_not_executed", "jobs": jobs,
        "crf_cpu_cli": "CRF_BINARY scene output_prefix WIDTH HEIGHT SPP SEED MAX_DEPTH THREADS",
        "note": "Choose SPP/seed/depth/threads and create output directories explicitly when rendering; no fixed performance assumptions."})
    script = Path(__file__).resolve()
    artifacts = {p.relative_to(destination).as_posix(): {"sha256": sha256(p), "bytes": p.stat().st_size}
                 for p in sorted(destination.rglob("*")) if p.is_file()}
    write_json(destination / "manifest.json", {
        "schema": "crf.fixture.manifest.v1", "status": "prepared_not_rendered_or_trained",
        "generator": "tools/prepare_fixture.py", "generator_sha256": sha256(script),
        "parameters": {"width": args.width, "height": args.height, "fov": args.fov, "radius": args.radius},
        "counts": {"views": 120, "train": 96, "val": 12, "test": 12, "lights": 3, "scene_files": 360},
        "validation_passed": validation["passed"], "aov_contract": aov,
        "external_assets": [], "neural_weights": [], "rendered": False, "trained": False,
        "gpu_started": False, "artifacts": artifacts,
        "manifest_self_hash": "omitted to avoid a circular hash dependency"})
    print(json.dumps({"output": str(destination), "validation_passed": validation["passed"],
                      "views": 120, "scenes": 360, "split_counts": validation["split_counts"],
                      "rendered": False, "trained": False}, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[1] / "fixtures" / "procedural_v1")
    parser.add_argument("--width", type=int, default=1024)
    parser.add_argument("--height", type=int, default=768)
    parser.add_argument("--fov", type=float, default=50.0, help="vertical image-edge field of view, degrees")
    parser.add_argument("--radius", type=float, default=4.8, help="orbit radius in metres")
    args = parser.parse_args()
    try:
        prepare(args)
    except (ValueError, OSError) as error:
        parser.exit(2, f"prepare_fixture: {error}\n")


if __name__ == "__main__":
    main()
