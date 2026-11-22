#!/usr/bin/env python3
"""Freeze inspected examples, render current functions, retain every earlier trial."""
import json,hashlib,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]; WEB=ROOT/'web'; PUB=WEB/'assets/v08/examples'; OUT=ROOT/'reports/v08/generation'
def read(p):return json.loads(p.read_text())
def write(p,d):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
choices={
 '01_ceramic_citrus':('polish','下缘与阴影的间隙缩小；保留釉面和橙肉细节。仍是固定观察方向的物体组合。'),
 '02_dark_fruit':('polish','苹果缺口被梨遮住，接触阴影更紧贴；不同来源的照明仍未统一分解。'),
 '03_coffee_fern':('polish','移除了与咖啡视角不一致的橙片；保留杯体和入画蕨叶。叶片虚化来自观测，未重新推断景深。'),
 '04_street_teal':('candidate','实际图像反馈修正初版紫色墙面。只有主墙面参数变化，保护区逐像素不变。'),
 '05_street_context_fill':('candidate','仅隐藏正面行人灯，显露既有推测墙面；保留支架与侧向灯。隐藏墙面无观测真值。'),
 '06_alpine_haze':('candidate','减弱并收窄二维雾带，保留近水纹理；这是参考条件下光色变体。')
}
catalog=read(WEB/'assets/v08/catalog.json'); meta={a['id']:a for a in catalog['assets']}
results=[]; examples=[];requests=[]
for id,(chosen,reason) in choices.items():
 record=read(OUT/id/'record.json'); scene=read(PUB/(id+'.'+chosen+'.scene.json'))
 write(PUB/(id+'.scene.json'),scene)
 proc=subprocess.run(['node','scripts/render_v08.cjs',str(PUB/(id+'.scene.json')),str(PUB/(id+'.png'))],cwd=ROOT,capture_output=True,text=True,check=True)
 actual=read(PUB/(id+'.render.json'))
 assetIds=sorted(set(o['assetId']for o in scene['objects']))
 record['finalRender']={**actual,'assetSHA256':{a:sha(WEB/meta[a]['assetUrl'])for a in assetIds},'sceneSHA256':sha(PUB/(id+'.scene.json'))}
 record['selection']={'chosen':chosen,'status':'visually_reviewed','reviewer':'assistant visual inspection','reason':reason,'photorealismIndependentlyProven':False,'referenceReconstructionScoreUsedAsGenerationScore':False,'finalAssetStateRerendered':True}
 if record.get('polish'):record['polish']['selection']='visually_reviewed'
 for u in [record.get('initial'),record.get('critique'),record.get('candidate'),record.get('polish',{}).get('usage')]:requests.extend((u or {}).get('requests',[]))
 write(OUT/id/'record.json',record);write(PUB/(id+'.record.json'),record);results.append(record)
 examples.append({'id':id,'title':record['title'],'sceneUrl':'assets/v08/examples/'+id+'.scene.json','thumbnailUrl':'assets/v08/examples/'+id+'.png','prompt':record['prompt'],'scope':record['scope'],'subtitle':'DeepSeek · 学习物体重新构图'if record['scope'].startswith('new_')else'DeepSeek · 参考语义编辑','reportUrl':'assets/v08/examples/'+id+'.record.json'})
ids={r['requestId']for r in requests if r.get('requestId')}
summary={'schema':'crf.generation_trials.v0.8','counts':{'completedCases':len(results),'distinctProviderRequests':len(ids),'observedImageCritiqueRequests':sum(r.get('critique',{}).get('providerCalls',0)for r in results),'retainedCandidateRenders':sum(len(r['actualRenders'])for r in results),'finalRenders':len(results)},'requests':requests,'results':results,'limits':['Reference-conditioned function composition; model weights were not trained.','Light and material are still entangled in observed RGB.','A 2D transform cannot recover unobserved geometry or new viewpoints.']}
write(OUT/'summary.json',summary);write(WEB/'assets/v08/generation.json',summary);write(WEB/'assets/v08/examples.json',{'examples':examples})
print(json.dumps(summary['counts']))
