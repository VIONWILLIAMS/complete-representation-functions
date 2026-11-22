#!/usr/bin/env python3
"""Measure an actual editor download with ordinary decoder settings."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--video', required=True)
p.add_argument('--encoding-report', required=True)
p.add_argument('--case', default='08_three_fruits')
a = p.parse_args()
video = Path(a.video)
encoding = json.loads(Path(a.encoding_report).read_text())
index = json.loads((ROOT/'web/assets/v09/generated/index.json').read_text())
entry = next(e for e in index['examples'] if e['id'] == a.case)
scene = ROOT/'web'/entry['sceneUrl']
probe = json.loads(subprocess.check_output([
    'ffprobe','-v','error','-count_frames','-select_streams','v:0',
    '-show_entries','stream=codec_name,width,height,avg_frame_rate,nb_read_frames,color_range,color_space,color_transfer,color_primaries:format=duration,size',
    '-of','json',str(video)], timeout=180))
stream = probe['streams'][0]
frame_probe = json.loads(subprocess.check_output([
    'ffprobe','-v','error','-select_streams','v:0','-show_frames',
    '-show_entries','frame=color_range,color_space,color_transfer,color_primaries',
    '-of','json',str(video)], timeout=180))
subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-i',str(video),'-map','0:v:0','-f','null','-'],check=True,timeout=180)
with tempfile.TemporaryDirectory(prefix='crf09-browser-colour-') as folder:
    expected_path = Path(folder)/'expected.png'
    subprocess.run(['node','scripts/render_v09.cjs',str(scene),str(expected_path),'--width','1920','--height','1080','--fit','contain','--time','0'],cwd=ROOT,check=True,capture_output=True,timeout=120)
    expected = np.asarray(Image.open(expected_path).convert('RGB'))
    decoded_bytes = subprocess.check_output(['ffmpeg','-hide_banner','-loglevel','error','-i',str(video),'-map','0:v:0','-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],timeout=120)
    decoded = np.frombuffer(decoded_bytes,dtype=np.uint8).reshape(1080,1920,3)
    v = encoding['viewport']; x,y,w,h = (v[k] for k in ('x','y','width','height'))
    reference = expected[y:y+h,x:x+w].astype(np.float64)
    result = decoded[y:y+h,x:x+w].astype(np.float64)
    diff = result-reference
    mask = np.ones((1080,1920),dtype=bool);mask[y:y+h,x:x+w]=False
    padding = decoded[mask]
    fidelity = {
        'expectedScene':a.case,
        'expectedSceneFileSHA256':hashlib.sha256(scene.read_bytes()).hexdigest(),
        'expectedFirstFrameRGBSHA256':hashlib.sha256(expected.tobytes()).hexdigest(),
        'contentViewportMAE':float(np.abs(diff).mean()),
        'contentViewportRMSE':float(np.sqrt((diff*diff).mean())),
        'paddingMeanRGB':float(padding.mean()) if padding.size else 0,
        'paddingMaxRGB':int(padding.max()) if padding.size else 0,
        'decoderOverrides':None,
        'scope':'Lossy first-frame measurement at identical camera/time/contain viewport; no exact-pixel or photorealism claim and no post-hoc quality threshold.'}
colour = encoding['colorMetadata']['encoderColorSpace']
aliases = {'smpte170m':'smpte170m','bt709':'bt709','iec61966-2-1':'iec61966-2-1','bt2020':'bt2020','bt2020-ncl':'bt2020nc','bt2020-cl':'bt2020c'}
expected_tags = {
    'color_range':'pc' if colour['fullRange'] else 'tv',
    'color_space':aliases.get(colour['matrix'],colour['matrix']),
    'color_transfer':aliases.get(colour['transfer'],colour['transfer']),
    'color_primaries':aliases.get(colour['primaries'],colour['primaries'])}
colour_ok = all(stream.get(k)==v for k,v in expected_tags.items())
frame_colour_ok = len(frame_probe.get('frames',[]))==120 and all(all(f.get(k)==v for k,v in expected_tags.items()) for f in frame_probe['frames'])
format_ok = stream['width']==1920 and stream['height']==1080 and stream['avg_frame_rate']=='24/1' and stream['nb_read_frames']=='120' and float(probe['format']['duration'])==5.0
report = {
    'schema':'crf.browser_video_export.v0.9','caseId':a.case,'actualDeepSeekScene':True,
    'formatPassed':format_ok,'ffprobe':probe,'allFramesDecoded':True,
    'bytes':video.stat().st_size,'sha256':hashlib.sha256(video.read_bytes()).hexdigest(),
    'viewport':{**encoding['viewport'],'padding':'opaque black'},
    'aspectRatioPreserved':(w,h,x,y)==(1440,1080,240,0),
    'colorMetadataPreserved':colour_ok,'decodedFramesAgreeWithEncoderColour':frame_colour_ok,
    'decodedFrameColour':frame_probe,'encoderReport':encoding,
    'lossless':False,'productionAuthenticatedBrowserTask':False,
    'browser':'managed-preview cloud Chrome',
    'source':'Actual editor download; shared evaluator and exact published scene/model snapshot.',
    'firstDecodedFrameComparison':fidelity,
    'supersedes':['video_export_stretched_diagnostic.json','video_export_colour_diagnostic.json','video_export_vp8_metadata_diagnostic.json']}
(ROOT/'reports/v09/browser/video_export.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'formatPassed':format_ok,'colorMetadataPreserved':colour_ok,'decodedFramesAgreeWithEncoderColour':frame_colour_ok,'firstDecodedFrameComparison':fidelity,'bytes':report['bytes']},ensure_ascii=False))
raise SystemExit(0 if format_ok and colour_ok and frame_colour_ok and report['aspectRatioPreserved'] else 2)
