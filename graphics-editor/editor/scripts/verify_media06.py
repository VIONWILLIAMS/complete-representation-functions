#!/usr/bin/env python3
"""Read and fully decode the three actual delivered video files."""
from pathlib import Path
import hashlib,json,subprocess
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'web/downloads'; REPORT=ROOT/'reports/v06/video_verification.json'
NAMES=['crf_0_6_common_5s.mp4','crf_0_6_courtyard_5s.mp4','crf_0_6_editor_5s.webm']
def run(args):return subprocess.run(args,check=True,capture_output=True,text=True).stdout
def fraction(value):
    a,b=value.split('/');return float(a)/float(b)
def main():
    records=[]
    for name in NAMES:
        p=OUT/name
        data=json.loads(run(['ffprobe','-v','error','-select_streams','v:0','-count_frames','-show_entries','stream=codec_name,width,height,nb_read_frames,avg_frame_rate,r_frame_rate,duration:format=duration','-of','json',str(p)]))
        stream=data['streams'][0];duration=float(data['format']['duration']);frames=int(stream['nb_read_frames']);fps=fraction(stream['avg_frame_rate'])
        subprocess.run(['ffmpeg','-v','error','-i',str(p),'-f','null','-'],check=True,capture_output=True)
        hashes=run(['ffmpeg','-v','error','-i',str(p),'-vf','select=eq(n\\,0)+eq(n\\,60)+eq(n\\,119)','-fps_mode','passthrough','-f','framehash','-hash','sha256','-'])
        selected=[line.split(',')[-1].strip() for line in hashes.splitlines() if line and not line.startswith('#')]
        item={'file':'web/downloads/'+name,'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'codec':stream['codec_name'],'width':stream['width'],'height':stream['height'],'duration':duration,'fps':fps,'decodedFrames':frames,'fullDecodeSucceeded':True,'selectedFrameIndices':[0,60,119],'selectedDecodedFrameHashes':selected,'motionObserved':len(set(selected))>1,'pass':frames==120 and abs(fps-24)<1e-5 and abs(duration-5)<1/24+.001 and len(selected)==3 and len(set(selected))>1}
        records.append(item)
    report={'schema':'crf.video_acceptance.v0.6','pass':all(r['pass'] for r in records),'target':{'duration':5,'fps':24,'frameCount':120},'lossyVideoIsNotExactRGBEvidence':True,'videos':records}
    REPORT.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps(report,ensure_ascii=False,indent=2))
    if not report['pass']:raise SystemExit(1)
if __name__=='__main__':main()
