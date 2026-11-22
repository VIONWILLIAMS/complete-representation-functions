#!/usr/bin/env python3
from pathlib import Path
from PIL import Image,ImageOps,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'web/downloads'
font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',22)
def panel(im,title,size):
 p=Image.new('RGB',(size[0],size[1]+48),'#101b26');d=ImageDraw.Draw(p);d.text((18,12),title,font=font,fill='#e8f1f5');im=ImageOps.contain(im,size,Image.Resampling.LANCZOS);p.paste(im,((size[0]-im.width)//2,48+(size[1]-im.height)//2));return p
files=[('crf_street_0_4_wall_blue.png','0.4 / hard ownership'),('crf_0_5_street_wall_blue.png','0.5 / mixed edges'),('crf_0_5_street_wall_blue_removed.png','0.5 / contextual wall')]
board=Image.new('RGB',(570*3,468),'#101b26')
for i,(file,title) in enumerate(files):
 im=Image.open(OUT/file).convert('RGB').crop((153,368,343,508)).resize((570,420),Image.Resampling.NEAREST);board.paste(panel(im,title,(570,420)),(i*570,0))
board.save(OUT/'crf_0_5_edge_comparison.png')
board=Image.new('RGB',(1000,796),'#101b26')
for i,(case,title) in enumerate([('street','Street / observed photo'),('fruit_lab','Apple & pear / native functions'),('orchard','Still life / observed photo'),('alpine','Alpine lake / observed photo')]):
 im=Image.open(OUT/f'crf_0_5_{case}_reference.png').convert('RGB');board.paste(panel(im,title,(500,350)),((i%2)*500,(i//2)*398))
board.save(OUT/'crf_0_5_cases_overview.png')
print('Saved edge comparison and four-case overview.')
