#!/usr/bin/env python3
"""Freeze the research-candidate disclosure from completed measurements."""
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def read(name):return json.loads((ROOT/name).read_text())
def write(name,value):(ROOT/name).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
s=read('reports/v09/experiment_summary.json')
m=read('reports/v09/media_verification.json')
f=read('reports/v09/boundary/fidelity.json')
a=read('web/assets/v09/acceptance.json')
if not s['allPlannedTrialsReported'] or not s['inputSnapshotStable']:raise SystemExit('Actual experiments are not final')
if m['status']!='passed_with_scope_limits' or not m.get('formatAndPixelChecksPassed') or not m.get('storageBudgetPassed') or len(m.get('results',[]))!=3:raise SystemExit('Media measurements did not pass engineering checks within their declared scope')
a['finalMeasurementsPending']=False
a['overallAccepted']=False
a['gates']['G0']['summary']='十个固定展示任务与180任务终测协议已冻结；新增101个来源中1个与旧test同源，未完成新的独立泛化评价。'
a['gates']['G1']['summary']='原街景PSNR48.317dB、SSIM0.9908；新增10万观测细节高斯，RGB完全一致30.82%，固定12图整组未完成。'
a['gates']['G2']['summary']='实际DeepSeek完成10个任务、30候选；照片真实感与泛化未通过。P3未通过，180任务终测未启动。'
a['gates']['G4']['summary']='固定3案均实际生成1080p、24FPS、120帧、5秒视频及三视图；属于图像平面深度视差，真实多视角门槛未通过。'
a['gates']['G5']['summary']='浏览器真实案例PNG保存/重载一致；完整工程逐项重绘结果见包内VERIFICATION。生产登录十任务及用户设备p95仍未完成。'
a['measurements']={'learningRounds':s['learning']['roundsComplete'],'downloadedReferenceSources':s['learning']['acceptedReferenceCount'],'savedPreviewFits':s['learning']['validSavedPreviewFitCount'],'referenceScope':'Source URL/photo identity and exact bytes deduplicated; not fully human-audited captures.','newImages':s['generation']['selectedActualImages'],'allCandidates':s['generation']['allCandidates']['actualPNGCount'],'initialPlanningFailuresRetained':s['generation']['preservedPlanningFailures'],'videos':len(m['results']),'videoFrames':sum(r.get('sourceFrameCount',120) for r in m['results']),'streetPSNR':f['candidate']['psnr'],'streetSSIM':f['candidate']['ssim'],'streetExactRGBFraction':f['candidate']['exactRGBFraction'],'oldHeldoutMetricsValidForCurrentModel':False,'terminalBenchmarkRun':False}
a['reports']={'experiments':'assets/v09/experiments.json','media':'assets/v09/media/verification.json','renderKit':'downloads/CRF_0_9_Render_Kit.zip','releaseNotes':'downloads/CRF_0_9_Report.md'}
write('web/assets/v09/acceptance.json',a);write('reports/v09/acceptance.json',a)
print(json.dumps({'status':'research_candidate','overallAccepted':False,'measurements':a['measurements']},ensure_ascii=False))
