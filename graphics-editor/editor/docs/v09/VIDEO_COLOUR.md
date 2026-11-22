# CRF 0.9 browser video colour metadata

## Change and scope

`web/crf-video09.js` is a new exporter. It exposes the existing `CRFVideo` API and the additional `CRFVideo09` alias. The earlier `web/crf-video.js` remains byte-for-byte unchanged; its SHA-256 is `6b56aecce1bcb60f233e5573cd8565e25a6c41e5579b2eb150c354056a98dd48`.

The new module passes colour declarations from `VideoEncoder`'s output callback, `metadata.decoderConfig.colorSpace`, into the WebM video track. It does not rescale RGB samples, infer metadata from the canvas, select a range from a visual comparison, or force a particular colour space. Frame scheduling, encoded chunks and strict dimensions retain the earlier implementation.

This fixes a missing-metadata path. A real browser export and ordinary decoder comparison are required to assess the resulting pixels; the measured development-browser result is recorded below. Passing the mapping tests alone does not establish pixel equality, codec losslessness, or a photo-quality gate.

### Decoder-level finding and revision 0.9.1

The first real re-export with Colour tags exposed a second issue: its stream tags were `pc`/`bt709`, but all 120 ordinarily decoded VP8 frames became `tv`/`bt470bg`. The first-frame ROI error therefore remained 10.77418/255 MAE. The immutable file hash and frame evidence are saved in `reports/v09/browser/video_colour_bitstream_diagnostic.json`; the previous diagnostics remain retained. Merely inspecting stream tags was insufficient.

Revision 0.9.1 prefers supported VP9 configurations before VP8. VP9 has explicit bitstream colour/range fields; Chromium's libvpx encoder sets those fields for VP9. The exporter now reads every VP9 keyframe's uncompressed colour header and compares its range/matrix with the encoder declaration. Conflicts abort the export. Unknown declarations are not filled from guesses. Unsafe VP8 fallback is rejected unless the encoder explicitly declares limited-range BT.601. This avoids repeating the observed incompatibility; it does not add RGB compensation or re-label the samples.

The actual browser VP9 export has now been verified in managed-preview Chrome, using the real DeepSeek `08_three_fruits` scene and its exact saved model. It selected `vp09.00.40.08`; all five keyframes matched the encoder declaration. Ordinary `ffprobe` stream metadata and all 120 decoded frames agreed on full range, BT.709 matrix/primaries and sRGB transfer. No decoder override was used. At the identical first-frame camera/time and 1440×1080 content viewport, RGB8 MAE fell from 10.7741836 to 1.3482637 and RMSE from 11.7404242 to 1.7785364. This remains lossy output and is evidence for this tested browser, not all device encoders.

The final 5-second, 24-FPS, 1920×1080 download and complete report are retained at `reports/v09/browser/08_three_fruits_5s.webm` and `reports/v09/browser/video_export.json`. The report includes the exact scene hash, encoder selection, bitstream events, every decoded frame's colour metadata, and first-frame pixel comparison.

## Container mapping

The `Colour` master element is written under `Segment/Tracks/TrackEntry/Video`.

| Encoder value | WebM element | Value |
| --- | --- | --- |
| `fullRange: true` | `Range`, `0x55B9` | 2 |
| `fullRange: false` | `Range`, `0x55B9` | 1 |
| `matrix` | `MatrixCoefficients`, `0x55B1` | H.273 enum mapping |
| `transfer` | `TransferCharacteristics`, `0x55BA` | H.273 enum mapping |
| `primaries` | `Primaries`, `0x55BB` | H.273 enum mapping |
| Missing or `null` value | Corresponding element omitted | Unspecified |

The enclosing `Colour` ID is `0x55B0`. All four unknown fields produce no Colour element. A future enum string that is not mapped remains visible in `unmappedFields` and is omitted from the container. Invalid types are rejected rather than coerced. The RGB identity matrix has numeric value zero and is preserved.

WebCodecs emits a decoder configuration initially and when it changes. Later chunks without `decoderConfig` use the existing declaration. A new complete configuration with a changed colour declaration is rejected: this exporter has one track and cannot truthfully assign one global Colour element to multiple colour configurations. This also applies if early output had unknown colour metadata and a later configuration supplies a value; the later value is not applied retroactively.

## Returned evidence

`encode()` returns the previous fields plus:

```js
{
  exporterVersion: '0.9.1',
  encoderSelection: { selectedCodec, preference, attempts, reason },
  colorMetadata: {
    source: 'VideoEncoder output metadata.decoderConfig.colorSpace',
    decoderConfigEvents: [
      // Actual timestamp, codec, coded dimensions, colorSpaceProvided,
      // and the four colour fields for each configuration event.
    ],
    bitstreamColourEvents: [
      // Actual keyframe timestamp, VP9 profile/bit depth/colour code,
      // matrix, fullRange, and metadata cross-check status.
    ],
    encoderColorSpace: { primaries, transfer, matrix, fullRange },
    webmColour: {
      written, matrixCoefficients, range,
      transferCharacteristics, primaries
    },
    unknownFields: [],
    unmappedFields: {},
    warnings: [],
    policy: '...'
  }
}
```

Here the unbound names indicate values in the actual report, not prescribed constants. `null` container values mean that element was omitted. Reports contain no pixel buffers or provider credentials.

## Verification

Run:

```sh
node --test tests/test_video09.cjs
```

Twelve tests cover independently parsed EBML fixtures for every supported colour enum, true/false/unknown range, prototype getters, unchanged encoded block bytes, absent metadata, configuration changes, dimensions, frame timing, VP9 preference/bitstream checks, and the legacy file hash. Genuine small VP8 and VP9 packets are also muxed and inspected with `ffprobe`: the VP8 fixture reproduces contradictory stream/frame metadata; the VP9 fixture requires agreement at both levels. Consumer tests skip explicitly if `ffprobe` is unavailable. No browser or provider call is made by these tests.

For the actual browser export, save its JSON report and WebM. Inspect with ordinary `ffprobe`/decoding without forced range or matrix options, then compare the decoded first frame with the independent scene render at the same camera/time/viewport. Keep the preceding failed export and its diagnostic as evidence rather than replacing their metrics.

## Primary specifications

- [W3C WebCodecs: Output EncodedVideoChunks and VideoColorSpace](https://www.w3.org/TR/2026/WD-webcodecs-20261119/), sections 6.6–6.7 and 9.10–9.13.
- [Matroska element specification](https://www.matroska.org/technical/elements.html), Video/Colour, Range, MatrixCoefficients, TransferCharacteristics and Primaries.
- [WebM container guidelines](https://www.webmproject.org/docs/container/).
- [VP9 uncompressed header specification](https://downloads.webmproject.org/docs/vp9/vp9-bitstream_superframe-and-uncompressed-header_v1.0.pdf), sections 4.1 and 4.3.
- [Chromium libvpx encoder](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/media/video/vpx_video_encoder.cc), `UpdateEncoderColorSpace`.
- [FFmpeg 7.1 VP8 decoder](https://ffmpeg.org/doxygen/7.1/vp8_8c_source.html), VP8 header decoding and output `colorspace`/`color_range` assignment.
- [RFC 6386](https://www.rfc-editor.org/rfc/rfc6386.html), section 9.2, VP8's restricted colour-space header.
