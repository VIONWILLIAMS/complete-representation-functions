# CRF 0.10 Gaussian kernel handoff

## Delivered code

- `web/crf-gaussian10.js`: direct affine anisotropic Gaussian evaluation at the requested resolution; linear-light compositing and material controls; optional highlight residual; visibility-aware object coverage; analytic contact shadows; immutable scene operations; runtime import of legacy function assets.
- `scripts/fit_gaussian10.py`: per-observation sparse numerical fitting, mixed uniform/structure initialization, displayed-sRGB Gauss–Newton updates, residual-guided point allocation, eight-parameter geometry optimization with pixel-footprint derivatives, optional same-budget colour polishing.
- `tests/test_gaussian10.py`: 4 independent numerical/cross-runtime tests.
- `tests/test_gaussian10.cjs`: 10 rendering, validation, visibility, editing and browser-fit tests.

No neural model is trained. Each fit solves coefficients and geometry for its particular source observation. No source RGB raster or residual RGB image is used by the rendering kernel. The semantic alpha mask is an explicitly stored observed coverage mask.

## Asset API

Global `CRFGaussian10` (alias `CRF10Gaussian`) and CommonJS exports. `render(asset, options)` and `renderScene(scene, options)` return `{width,height,data,diagnostics,objectCoverage?}`.

A function asset uses schema `crf.gaussian_asset.v0.10`, dimensions, `base:[r,g,b]`, and `splats:[[x,y,sigmaX,sigmaY,theta,cR,cG,cB], ...]`. Coefficients are signed. Source coordinates use pixel centers. Angle is radians in splats. Optional alpha is `rle8`.

The default colour basis is `kernel.colorSpace='linear_srgb'`. A compatibility profile `srgb_encoded_0_1` preserves legacy numerical reconstruction quality. That profile is decoded to linear radiance before material edits and compositing; its Gaussian filtering remains in encoded colour and must not be described as physical radiance integration.

`importLegacyAsset(asset08)` converts parameters at runtime and requires no new asset file. It analytically subtracts native pixel variance from the legacy covariance and compensates coefficient amplitude. Identity-view, native-size, `filter:'mip'` evaluation preserves old sample values. Do not use `filter:'point'` when checking compatibility.

## Scene and edit units

Scene schema is `crf.gaussian_scene.v0.10`. A scene contains width, height, an sRGB8 background, an `assets` dictionary and `objects` array. Objects have stable IDs and `assetId`, `x`,`y` in scene pixels, `scaleX`,`scaleY` as factors, `rotation` in degrees, `opacity`,`visible`,`zIndex`.

Appearance controls are `albedoTint:[1,1,1]`, `exposure` in EV and `illuminationGradient:[gx,gy]` in EV across normalized object coordinates. `preserveHighlights:true` preserves a bright neutral residual under tint. This is an optional deterministic heuristic: a bright white diffuse surface may also satisfy its rule. It is not an albedo/BRDF recovery model.

`shadow` accepts strength, spread, dx, dy, squash; geometry is anchored to the nonzero coverage bounds, not the entire image rectangle. It is a controllable contact-shadow approximation, not a physical shadow simulation.

`applyOps` supports add, remove and set/update operations. Allowed set properties include the appearance fields above, transforms, visibility, shadow and assetId.

Render options accept width, height, `filter:'mip'|'point'`, `coverage:true`, `transform:{panX,panY,zoom,rotation}` and `edits:{groups:{objectId:{...}}}`. All views are explicitly two-dimensional affine views. `objectCoverage[id]` gives actual visible alpha contribution after later layers occlude earlier ones; shadows do not count as object coverage.

Browser `fitImage` uses the existing numerical optimizer with full-precision linear-light input and analytic covariance conversion. Its configuration is separately named and must not inherit offline benchmark numbers.

## Verification and limitations

Read `evidence-summary.json` for measured data and `object-runtime-parity.json` for production-asset cross-runtime checks.

All four new object assets have zero visible RGB discrepancy between Python and JavaScript evaluation and exactly preserved alpha. They have 4096 Gaussians each; observed-reference PSNR is 34.34 dB for apple, 35.89 dB for pear, 32.54 dB for cut orange and 38.41 dB for the ceramic vase. These describe reconstruction of source observations, not new-scene ground truth.

The new linear-light street fitting configuration did **not** outperform the old solver at an equal 8192-point budget: 26.02 dB, or 27.48 dB after extra same-budget colour polishing, versus 28.13 dB for the previous solver. Compute budgets are not equal. This regression is retained in the evidence. The production-quality fallback imports the existing 65536-point street function asset at runtime; its 667000 RGBA pixels are exactly equal to the previous renderer at native resolution. That equality is between two renderers, not a claim of exact agreement with the original photograph.

Native rendering of that street asset took 444 ms in this CPU environment, plus 26 ms to convert/check. Per-object 4096-point offline fits took about 6–14 seconds under the measured settings. Browser and slower devices will differ.

The pixel-footprint mechanism is tested against independent 64×64 subpixel box integration for a synthetic narrow Gaussian under 4× minification. Its linear MSE was 0.0000028346 versus 0.0031998 for point sampling. This supports the filtering mechanism; it is not an across-photographs quality claim or a complete implementation of Mip-Splatting.

Observed lighting remains in the source functions. Alpha filtering uses separate coverage integration followed by floating-point linear compositing; it is not joint analytic integration of premultiplied colour and alpha. Complete scene understanding, unknown surfaces, true 3D camera changes, physically correct relighting and pure text-to-image generation are not supplied by this kernel.

## Reproduce optional same-budget colour repair

```
OPENBLAS_NUM_THREADS=1 python scripts/fit_gaussian10.py web/assets/reference.png \
  --polish-asset reports/v10/kernel/street-8192.json \
  --output reports/v10/kernel/street-8192-polished.json \
  --iterations 40 --polish-rounds 3
```

The repair holds geometry and point count fixed, preconditions the colour solver and accepts only actual-loss-improving steps. Python requires NumPy, SciPy and Pillow; full geometry optimization also requires a C++ compiler. The executed source fingerprint is captured when the module loads for future runs.
