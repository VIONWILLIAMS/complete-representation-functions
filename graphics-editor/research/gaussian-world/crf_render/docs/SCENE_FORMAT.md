# CRF renderer interface — fixed for this implementation

Plain ASCII, one command per line, # comments permitted. Coordinates: Y up. All color reflectance / radiance values are linear RGB. Material names have no whitespace. Primitive triangles are two-sided, with outward geometric normals retained for dielectric entering/exiting.

```
camera ox oy oz tx ty tz vfov_degrees aperture_radius focus_distance
env horizon_r horizon_g horizon_b zenith_r zenith_g zenith_b intensity
sun toward_x toward_y toward_z irradiance_r irradiance_g irradiance_b angular_radius_degrees
fog density r g b  # optional camera-distance extinction / single-scatter approximation, disclose not full volume integration
mat NAME TYPE r g b roughness ior TEXTURE scale bump
sphere NAME cx cy cz radius
tri NAME ax ay az bx by bz cx cy cz
trin NAME ax ay az bx by bz cx cy cz nax nay naz nbx nby nbz ncx ncy ncz
quad NAME ox oy oz ux uy uz vx vy vz
```

TYPE: 0 Lambert diffuse, 1 GGX metal, 2 smooth dielectric, 3 emissive, 4 diffuse + GGX dielectric coating. TEXTURE: 0 flat, 1 plaster, 2 wood grain long axis X, 3 stone, 4 ceramic, 5 fabric, 6 terrain (optional). Material color for dielectric is Beer transmission color per world unit (0..1), not surface tint on each bounce.

`quad` = origin plus edge vectors U,V; quad emitters are the sampled area light sources, two-sided emission allowed. Winding for trin still geometric outward. All primitive material names refer to a previous mat. Blender, external photos, mesh downloads, and generated-image APIs are NOT involved.

Renderer CLI: `./crf_render scene.txt output_prefix WIDTH HEIGHT SPP SEED [MAX_DEPTH] [THREADS]`; it creates output_prefix.pfm (linear beauty), _albedo.pfm, _normal.pfm, _depth.pfm and .json render metadata. PFM standard bottom-to-top rows, little endian. Camera normal image encoded n*0.5+0.5, depth repeated in RGB, albedo RGB. AOVs computed using center pinhole ray, no jitter. Render should print progress and elapsed time. RNG per pixel+seed means repeatable irrespective thread count. Default output should have no exposure/tone-map baked into HDR.

Root builds `scenes/common.py`: Scene with `camera(origin,target,fov=40,aperture=0.0,focus=0)`, `env(horizon,zenith,intensity=1)`, `sun(direction,color,angle=.53)`, `mat(name,color,kind=0,rough=.4,ior=1.5,tex=0,scale=1,bump=0)`, `sphere(mat,center,r)`, `tri(mat,a,b,c,normals=None)`, `quad(mat,origin,u,v)`, `box(mat,center,size,rotation_y=0)`, `lathe(mat,profile,center=(0,0,0),segments=96)` where profile=[(radius,height),...] and rotations around Y, `cylinder(mat,a,b,r0,r1=None,segments=20,cap=True)`, `ellipsoid(mat,center,radii,segments=40,rings=20)`, `write(path)`. Utility tuples and math pure Python. Individual scene modules expose `build()` returning Scene and have CLI write argument. They may implement local mesh helpers and import common. Do not edit others' scene files or common.py.
