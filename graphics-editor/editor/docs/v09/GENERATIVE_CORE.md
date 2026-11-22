# CRF 0.9 native generative core

The new `web/crf-generative09.js` exports the same UMD API in Node and browser.
It generates new pixels from semantic functions, without reading a photograph,
texture atlas, raw pixel residual, mesh, or a completed external generated image.

**Status: research candidate. The photorealism and full P3 gates have not passed.**
This explicit status is independent of software tests or successful image export.

## Mathematical representation

A scene is `crf.generative_scene.v0.9`. Geometry uses analytic image-plane
coverage and normals. Appearance combines seeded Gaussian convolution fields,
linear-light shading, contact/attachment constraints, and an actual learned
canonical Gaussian coefficient family. It is **not** a renderer composed solely
of independently stored RGB splats: analytic coverage and shape programs are an
explicit part of the representation.

The shared model is `crf.shared_appearance.v0.9`:

- Per-category linear RGB moments and four Gaussian-band amplitudes learned from
  training observations. The renderer uses band amplitudes for newly sampled
  fields; it does not place whole source pictures in a scene.
- `functionFamilies.fruit_skin`: mean and low-rank modes of RGB coefficients on
  one canonical 17×17 Gaussian basis, jointly fitted across training instances.
  The field describes log-linear high-frequency appearance after a local
  low-pass removal. It is not a ground-truth intrinsic albedo estimate.
- Seeds sample new coefficients. Programs include model weights, names and
  provenance. The learned functions still depend on the training observations;
  they are not knowledge acquired by changing DeepSeek's neural weights.

`scripts/build_shared09.py` uses the 42 existing real downloaded references,
groups source/near-copy observations before splitting, and learns only on the
training subset. All splits and failures are in `reports/v09/shared_learning.json`.
The split is exploratory: actual capture identity was not manually verified for
every web photograph. It is not the final G2 data split.

Canonical fruit silhouette learning was attempted, but clipped/noisy masks were
rejected. A single orange silhouette is retained as evidence. Runtime requires
at least two instances to apply a learned shape, so it does not silently pass a
single observed shape as a general learned family.

## API

```js
const scene = CRF09.createScene({
  category: 'still_life', seed: 391, width: 1024, height: 768,
  objects: [{ id:'fruit', type:'pear', x:.5, y:.6, width:.28,
    height:.48, color:[160,170,60], depth:.6, roughness:.6 }]
}, sharedModel);
const result = CRF09.renderScene(scene); // decoded RGBA + diagnostics
const next = CRF09.applyOps(scene, [
  {op:'set', id:'fruit', values:{color:[175,125,50]}}
]);
```

Other exports: `normalizeScene`, `validateScene`, `generateExamples`,
`extractAppearance`, `learnAppearance`.

Categories are `architecture`, `landscape`, `still_life`. Object types are
`window`, `pole`, `signal`, `tree`, `ridge`, `apple`, `pear`, `orange`, `vase`,
`rock`. An unsupported class is not a supported generated object.

Object x/y are normalized centers; width/height are normalized extents. Larger
depth means nearer. An attachment's `anchor:[dx,dy]` is authoritative relative
to its parent. Parent visibility propagates at render time. Missing or cyclic
parents are rejected. Source object identity is never changed by camera motion.

Optional `environment` includes `wallColor`, `groundColor`, `skyColor`,
`horizon`, `fog`, `texture`, `terrain`. `light` includes azimuth, elevation,
intensity and warmth. `camera` has panX/panY (−.12..+.12) and zoom (.8..1.3).
Implemented terrain functions are exported in `TERRAINS`: `alpine` uses ridges,
lake reflection and shoreline; `coast` uses a sea horizon, procedural shallow
waves, Gaussian foam and a beach; `forest` uses tapered bark/trunk fields,
Gaussian foliage populations, ground/path and atmospheric light shafts.
They are distinct procedural scene programs. Acquiring color statistics alone
cannot add a new terrain program or prove any of these photorealistic.

All illumination is computed in linear RGB and converted to RGB8 at the end.
The older 0.8 encoded-sRGB coefficient interpretation is not changed.

## Learning in the editor

`extractAppearance(decodedRGBA,{id,sourceGroup,category})` reads actual decoded
pixels and returns sufficient statistics. `learnAppearance(samples,
{previousModel})` aggregates valid unique observations and records their IDs.
If a previously trained coefficient family is present, it is retained. New
online reference observations update band statistics only; they do not secretly
retrain the offline canonical coefficient PCA.

## Limits and evidence

- Held-out band prediction did not improve overall in the first experiment.
- Oracle projection into the PCA basis uses the held-out target to choose latent
  coefficients. It measures basis fit, not unconditional generated-image quality.
- Depth-layer parallax is an inferred image-plane effect, not true multiview
  reconstruction; no unseen ground-truth recovery is claimed.
- Procedural background regeneration makes deleting an analytic object reveal a
  coherent background, but does not validate photographic hidden-region inpainting.
- The eight core examples are explicit program demonstrations, not DeepSeek calls.
  Actual model-driven editor jobs are reported by the separate task runner.

Run `node --test tests/test_generative09.cjs` and
`node scripts/verify_generative09.cjs`. The report keeps the three bounded
hypothesis iterations, all predefined examples, performance and failure flags.

No test count, image hash, or numerical descriptor improvement is substituted
for the frozen semantic and photoreal acceptance contract.
