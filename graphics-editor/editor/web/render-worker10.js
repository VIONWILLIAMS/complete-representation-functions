/* CRF 0.10 worker: all displayed output comes from the selected CRF evaluator. */
'use strict';
importScripts('crf-gaussian08.js','crf-generative09.js','crf-boundary09.js');
let gaussianLoadError = null;
try { importScripts('crf-gaussian10.js'); } catch (error) { gaussianLoadError = error.message; }
let streetPromise = null, currentAssetKey = null, currentAssets = null;
self.onmessage = async function (event) {
  const message = event.data, { id, kind, options = {} } = message;
  const started = performance.now();
  try {
    if (message.operation === 'fit') {
      if (!self.CRFGaussian10) throw new Error(gaussianLoadError || '二维高斯求解器尚未载入。');
      const asset = await CRFGaussian10.fit(message.image, {
        ...options,
        onProgress: progress => self.postMessage({ id, progress, event: 'progress' })
      });
      self.postMessage({ id, ok: true, asset, milliseconds: performance.now() - started });
      return;
    }
    let result, scene = message.scene;
    if (kind === 'gaussian') {
      if (!self.CRFGaussian10) throw new Error(gaussianLoadError || '二维高斯求值器尚未载入。');
      if (message.assets) { currentAssets = message.assets; currentAssetKey = message.assetKey; }
      if (message.assetKey) {
        if (currentAssetKey !== message.assetKey || !currentAssets) throw new Error('高斯资产缓存已失效，请重新打开当前工程。');
        scene = { ...scene, assets: currentAssets };
      }
      result = scene.schema === 'crf.gaussian_asset.v0.10'
        ? CRFGaussian10.render(scene, options)
        : CRFGaussian10.renderScene(scene, options);
    } else if (kind === 'street') {
      if (!streetPromise) streetPromise = CRFBoundary09.loadStreet({ baseUrl: '', gaussianEngine: CRF08 }).catch(error => { streetPromise = null; throw error; });
      result = CRFBoundary09.renderStreet(await streetPromise, message.street || {});
    } else if (kind === 'native') {
      const valid = CRF09.validateScene(scene);
      if (!valid.ok) throw new Error(valid.errors.join(' '));
      result = CRF09.renderScene(scene, options);
    } else if (kind === 'observation') {
      result = CRF08.renderAsset(scene, options);
    } else throw new Error('未支持的表示类型。');
    const data = new Uint8ClampedArray(result.data);
    const response = { id, ok: true, width: result.width, height: result.height, data,
      diagnostics: result.diagnostics || result.stats || {}, milliseconds: performance.now() - started };
    if (result.objectCoverage) response.objectCoverage = result.objectCoverage;
    self.postMessage(response, [data.buffer]);
  } catch (error) {
    self.postMessage({ id, ok: false, error: String(error.message || error).replace(/sk-[A-Za-z0-9_-]{12,}/g, '[凭据已隐藏]').slice(0, 800) });
  }
};
