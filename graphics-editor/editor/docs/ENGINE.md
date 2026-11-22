# CRF Street 0.4 — editable observed Gaussian engine

## What this engine represents

This experiment deliberately retains dense observed RGB data. Each original
pixel becomes a finite-support, positive Gaussian radiance sample attached to
an identified surface. At the original resolution and camera, the exact mode
uses sigma = 0.18 reference pixels and a radial support of 0.49 pixels. Thus the
pixel-center sample is its Gaussian's center, with weight `exp(0) = 1`, and no
neighboring source center contributes. RGB is nevertheless obtained by the
Gaussian accumulation and normalization path; there is no source-image blit,
background-image substitute, or post-render copying of reference pixels.

This is **dense observation replay**, not trained 3D Gaussian Splatting, scene
compression, automatic 3D understanding, or recovery of hidden geometry. Its
RGB storage cost remains three bytes per original pixel, plus labels, inferred
fill and editable metadata. It changes the representation allowance from the
earlier 0.3 experiment, which prohibited dense image payloads.

Each object is a lifted observed plane, optionally with a linear depth slope.
The depths, surface normals, semantic masks and hidden-region fill are stated
single-view hypotheses. Camera movement reprojects these same samples and
transforms their covariance into ellipses. It does not manufacture verified
back sides. The supplied background RGB is used **only** at explicitly inferred
pixels with a different host label; these become additional Gaussians attached
to the host object. Moving the host moves its fill. The original photograph is
never used as a stationary browser background.

## Browser and Node entry points

`web/crf-core.js` exposes `window.CRFCore` and `module.exports`. It has no package
dependencies and does not use DOM, network, filesystem, `eval`, or generated
JavaScript. The same module performs browser fallback and Node frame rendering.

```js
const C = require('./web/crf-core.js');
const state = C.initialState(data);
const result = C.CPUrender(data, state, {
  quality: 'exact',        // or 'interactive'
  width: 667, height: 1000,
  time: null,              // null: static base state; number: evaluate tracks
  lod: 2                  // interactive only; exact always uses every sample
});
// result = {width, height, rgba, ids, inferred, stats}
// rgba: Uint8ClampedArray, top-to-bottom RGBA8, opaque alpha
// ids: Int32Array of object.index, or -1 for unoccupied screen pixels
// inferred: Uint8Array identifying the visible inferred host samples
```

`time` omitted means `0`; a numeric time evaluates the timeline exactly once
inside either renderer. The UI should supply its unmodified base state plus the
time, not evaluate the state and then pass that result with the same time again.
The explicit `time: null` mode supports editing a static view even when the
saved state already contains camera-animation tracks.

`decodeData(data)` returns cached read-only-by-convention typed arrays:
`{width,height,rgb,labels,backgroundRgb?,backgroundLabels?,inferredMask?}`. The UI
can compare the actual rendered image with `rgb`; this API does not paint it.
Source arrays must not be mutated by callers.

Other public functions:

| Function | Return / meaning |
|---|---|
| `initialState(data)` | A fresh JSON-serializable editable state |
| `validateState(state)` | `{valid, errors}`; invalid states are not rendered |
| `applyOperations(state, ops)` | A new state, or an exception; the whole batch is atomic |
| `project([x,y,z], state, {width,height}?)` | `{x,y,depth}` in output pixels and camera depth |
| `evaluateFrame(state,t)` | A new state with validated interpolated parameters |
| `CPUrender(data,state,options)` | RGBA, ID/inference maps and measured rendering statistics |

## State and units

```js
{
  schema: 'crf.state.v0.4', width: 667, height: 1000,
  objects: [{
    id, index, label, kind, group, parent,
    sourceId,             // source object ID; null for a new analytic prototype
    bbox: [x0,y0,x1,y1],  // half-open reference image bounds
    pivot: [u,v],         // reference image coordinates
    depth, restDepth, depthSlope: [dz_du,dz_dv], normal: [nx,ny,nz],
    transform: {x:0,y:0,z:0,scaleX:1,scaleY:1,rotation:0},
    color: {tint:[255,255,255],amount:0}, exposure:0, opacity:1,
    visible:true, deleted:false, prototype:null, signalState:'observed'
  }],
  camera: {yaw:0,pitch:0,panX:0,panY:0,zoom:1},
  light: {exposure:0,azimuth:0,elevation:45,strength:0,temperature:0},
  timeline: {duration:3,tracks:[]},
  background: {mode:'inferred',color:[26,28,32],highlightInferred:false}
}
```

All angles are degrees. Editable translation x/y uses reference pixels, right
and down. Depth and z translation use reference-pixel units toward the observer.
World coordinates supplied to `project` are centered: `x=u-width/2`,
`y=height/2-v`, `z=depth`. Camera pan uses reference screen pixels. Camera
projection is orthographic, with yaw followed by pitch and zoom. It is not a
metric camera calibration or a recovered focal length.

An object's plane has `z=depth+dz_du*(u-pivot.u)+dz_dv*(v-pivot.v)`.
Parents compose the child's 2D affine transform, translations in depth, and
visibility. A parent's depth edit also carries its children by the depth change
relative to its recorded rest depth. Parent cycles, unknown parents, repeated
IDs, unknown registered fields, nonfinite values and out-of-range parameters
are rejected. Undo/redo belongs to the UI and stores complete state snapshots.

## Registered operations

```js
[
  {op:'set', id:'pole.main', path:'transform.x', value:20},
  {op:'set', id:'pole.main', path:'color.tint', value:[180,90,30]},
  {op:'set', id:'pole.main', path:'color.amount', value:0.7},
  {op:'set', id:'signal.main', path:'signalState', value:'go'},
  {op:'setCamera', values:{yaw:5,pitch:2,zoom:1.05}},
  {op:'setLight', values:{exposure:0.3,strength:0.25,azimuth:30}},
  {op:'setBackground', values:{highlightInferred:true}},
  {op:'duplicate', id:'window.r1.c0', newId:'window.copy', offset:[80,0]},
  {op:'replace', id:'window.copy', prototype:'ellipse'},
  {op:'addPrototype', id:'shape.new', label:'New shape', prototype:'triangle',
   x:450,y:600,width:90,height:120,depth:250,color:[100,160,220]},
  {op:'reparent', id:'shape.new', parent:'pole.main'},
  {op:'delete', id:'window.copy'}
]
```

`set` accepts `transform` or its six scalar fields; `color`, `color.tint`,
`color.amount`; `visible`, `opacity`, `depth`, `depthSlope`, `normal`, `exposure`,
`signalState`, `label`, and `parent`. Shape prototypes are the finite registered
set `ellipse`, `rectangle`, `triangle`, `diamond`, `ring`. New prototypes are
sampled analytic shapes with a simple analytic brightness variation; they do
not borrow unrelated image patches. Replacement retains the original object's
identity, placement, parent and bounds but generates the new shape's samples.

`signalState` supports `observed`, `stop`, and `go`. Observed/stop preserve the
observed stop state. Go applies a registered local function: it extinguishes
the observed red emissive glyph in the upper panel and generates a green walking
glyph in the lower panel. Panel bounds come from explicit semantic metadata or
a documented fallback proportion. The housing is not globally dyed green.
This is a generated signal-state prototype, not a claim to recover an unseen
original lamp image.

## Time trajectories

```js
{op:'setTimeline',timeline:{duration:3,tracks:[
  {id:'$camera',path:'yaw',interpolation:'smooth',keyframes:[
    {time:0,value:0},{time:1.5,value:6},{time:3,value:0}]},
  {id:'pole.main',path:'transform.x',interpolation:'linear',keyframes:[
    {time:0,value:0},{time:3,value:20}]}
]}}
```

Tracks target object IDs, `$camera`, or `$light`. Interpolation is linear,
smoothstep, or step; numeric vectors interpolate componentwise. The time range,
strictly increasing keyframes, target IDs and fields are validated. Every
evaluated state must also satisfy the usual parameter validation. A trajectory
is a constrained parameter program and does not execute imported source code.

## Gaussian accumulation and light

For each object, transformed sample centers `m_i` and the surface Jacobian `J`
give `C = sigma² J Jᵀ + epsilon I`. A contribution at output pixel center `p`
is `w_i = exp(-0.5 (p-m_i)ᵀ C⁻¹ (p-m_i))`, truncated at the stated support.
The object's color is `sum(w_i*c_i)/sum(w_i)`. Each layer also accumulates depth
and the inferred-sample indicator. Opaque surfaces use a per-pixel depth test;
layer opacity is composited in mean-depth order, so intersecting translucent
surfaces are not a full order-independent transparency solution.

Interactive rendering samples a configurable lattice, normally step 2, and
widens the kernel to avoid the sparse appearance of the exact narrow-support
replay under camera movement. This is an explicit quality/performance tradeoff;
it is not used to certify exact observation equality.

Tint keeps the local observed luminance by scaling the requested RGB tint to
that luminance, then blends it with the original color. Exposure, a directional
gain relative to an assumed normal, and a warm/cool gain are separate functions.
Default color and light values are exactly identity. These functions modify
already-observed radiance, whose original illumination and material are mixed.
They do **not** recover true albedo, BRDF, cast shadows, indirect illumination,
or a physically identified daylight environment.

## Browser renderer contract

`web/crf-renderer.js` exposes `CRFRenderer`. It prefers WebGL 2 float
accumulation when supported, otherwise call the same `CPUrender` implementation.

```js
const renderer = new CRFRenderer(canvas, data);
renderer.resize(667,1000);
const stats = renderer.render(state,{quality:'exact',time:null});
const {width,height,rgba} = renderer.readPixels();
const objectId = renderer.pick(canvasPixelX,canvasPixelY); // ID or null
renderer.dispose();
```

The actual selected backend and any fallback reason are reported in `stats`.
Canvas coordinates passed to `pick` are physical output pixels, not CSS pixels.
The UI must convert client coordinates by the displayed element's size.

### GPU implementation and current validation status

The WebGL implementation is included but **has not been GPU-validated in the
current environment**. The managed cloud browser reported WebGL 2 unavailable,
and correctly used the shared CPU fallback. Its actual displayed/read-back
667×1000 baseline passed exact RGB8 equality; a wall tint changed wall pixels
with zero changed pixels outside that label. Restoring the original
state passed exact equality again, and wall/pole/signal picking was checked.
This evidence validates the browser CPU route, not the shader execution route.
No claim of measured GPU acceleration or GPU/CPU pixel equivalence is made.
The scene masks were refined after this first browser check. Final per-scene
counts, file hashes, timings and browser results must be read from
`reports/browser_verification.json` and the final delivery reports rather than
inferred from this architectural description.

The GPU path uses the same prepared source samples, camera matrices, projected
covariances and color/light coefficients as the CPU path. Per-object instanced
quads evaluate the Gaussian exponential in the fragment shader. Additive
blending writes weighted RGB/weight to `RGBA32F` and weighted depth/inference
to `RG32F`. A separate normalization pass writes the main `RGBA8` color,
`R32UI` object/inference ID and a 24-bit depth attachment. The accumulation
framebuffer is cleared before each object. A shader never samples the texture
that is attached to its active draw framebuffer; the final presentation pass
samples the finished color texture while drawing to the default framebuffer.
Picking reads the integer ID attachment with `RED_INTEGER`/`UNSIGNED_INT`,
not an RGB heuristic. Read-back flips WebGL's bottom-up rows into the public
top-down API convention. Opaque output alpha remains one during compositing.

Both required capabilities are explicitly checked before selecting the GPU
route: [EXT_color_buffer_float](https://registry.khronos.org/webgl/extensions/EXT_color_buffer_float/)
for renderable floating-point attachments and
[EXT_float_blend](https://registry.khronos.org/webgl/extensions/EXT_float_blend/)
for additive blending into 32-bit float buffers. Incomplete framebuffers,
shader errors or later GL errors cause an explicit fallback with its reason.
The presence of this fallback does not certify the unexecuted shader path.

## Verification boundaries

Exactness must be measured from the actual output RGBA buffer or an exported
PNG against the original RGB8 bytes, at 667×1000, with default transforms,
light, color and camera. An edited state should differ in the edited region;
its changed pixels do not invalidate the baseline observation replay result.
Local color edits are additionally checked to leave other labeled source
objects unchanged at the exact original view. Geometry, parent motion,
occlusion, covariance variation, source-independent primitives, inferred-fill
disclosure, invalid operations and deterministic timeline frames have separate
tests; a successful pixel replay is not evidence for those other properties.

Run the engine's independent executable checks with:

```sh
node --test tests/test_core.cjs
```

The current suite has 15 tests, including an independently computed Gaussian
weighted-average value at a subpixel translation and a full 667,000-pixel
comparison. Step tracks are also checked immediately before, exactly at, and
immediately after a keyframe, including the final keyframe. The full-image test executes all 667,000 observed samples and the current
scene's explicit inferred host samples, then checks zero differing RGB8 channels
and zero visible inferred pixels in the untouched original view. Its printed
statistics report the actual inferred count from the current data snapshot;
the final release reports retain the matching data hash. Passing the fixed
scene does not guarantee arbitrary imported scenes or new camera views.
