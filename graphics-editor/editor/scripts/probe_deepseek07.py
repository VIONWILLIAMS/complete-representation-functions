#!/usr/bin/env python3
"""Small real provider check; the credential is read through hidden stdin only."""
from pathlib import Path
import argparse,datetime,getpass,json,urllib.request,urllib.error

ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser()
parser.add_argument('--mode',choices=['models','search'],default='search')
args=parser.parse_args()
key=getpass.getpass('DeepSeek key (hidden): ')
body=None
endpoint='https://api.deepseek.com/models'
if args.mode=='search':
    endpoint='https://api.deepseek.com/chat/completions'
    body=json.dumps({'model':'deepseek-flash','thinking':{'type':'disabled'},'max_tokens':2200,'tools':[{'type':'deepseek_web_search'},{'type':'deepseek_read_url'}],'messages':[{'role':'user','content':'请实际联网搜索，为一个用代码渲染照片的 CRF 系统查找参考：窗边自然光照下的陶瓷花器与木桌静物、雨夜湿路面交通信号、现代室内自然采光。请搜索至少三种场景，每类给出真实来源链接，提炼形态、材质、光照、相机和细节规律。若来源中包含可访问参考照片请列出图片网页，不要把没看过的图片描述成已分析。我们使用解析几何、程序材质和光线追踪渲染，结果用于编写可编辑场景程序。'}]},ensure_ascii=False).encode()
request=urllib.request.Request(endpoint,data=body,headers={'Authorization':'Bearer '+key,'Content-Type':'application/json'})
record={'schema':'crf.provider_probe.v0.7','recordedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'endpoint':endpoint,'mode':args.mode}
try:
    response=urllib.request.urlopen(request,timeout=120)
    record.update(status=response.status,response=json.loads(response.read().decode()))
except urllib.error.HTTPError as error:
    record.update(status=error.code,error=error.read().decode()[:2000].replace(key,'[redacted]'))
except Exception as error:
    record.update(status=0,error=str(error).replace(key,'[redacted]'))
out=ROOT/'reports/v07';out.mkdir(parents=True,exist_ok=True)
target=out/(args.mode+'_probe.json')
target.write_text(json.dumps(record,ensure_ascii=False,indent=2).replace(key,'[redacted]')+'\n')
response=record.get('response',{}); message=(response.get('choices') or [{}])[0].get('message',{})
print(json.dumps({'status':record['status'],'model':response.get('model'),'requestId':response.get('id'),'serverToolCalls':message.get('server_tool_calls'),'annotations':message.get('annotations'),'usage':response.get('usage'),'error':record.get('error'),'saved':str(target)},ensure_ascii=False,indent=2))
if record['status']!=200:raise SystemExit(1)
