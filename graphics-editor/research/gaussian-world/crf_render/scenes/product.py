"""Atelier 01: procedural glass, brass and limestone product photography.
The bottle, label strokes, fine cap fluting, plinth and olive sprig are all meshes.
No photographs, external models or bitmap textures are used.
"""
import math, random, sys
from common import Scene, add, sub, mul, norm, cross, lerp

# Minimal monoline letters, deliberately defined here rather than a bitmap/font asset.
GLYPHS={
 'A':[[(0,0),(.5,1),(1,0)],[(.22,.43),(.78,.43)]],
 'T':[[(0,1),(1,1)],[(.5,1),(.5,0)]],
 'E':[[(1,1),(0,1),(0,0),(1,0)],[(0,.51),(.8,.51)]],
 'L':[[(0,1),(0,0),(1,0)]],
 'I':[[ (.5,0),(.5,1)]],
 'R':[[(0,0),(0,1),(.75,1),(1,.82),(1,.62),(.75,.5),(0,.5)],[(.55,.5),(1,0)]],
 'C':[[(1,.85),(.78,1),(.2,1),(0,.78),(0,.2),(.2,0),(.78,0),(1,.15)]],
 'F':[[(0,0),(0,1),(1,1)],[(0,.52),(.8,.52)]],
 '0':[[(.2,0),(0,.22),(0,.78),(.2,1),(.8,1),(1,.78),(1,.22),(.8,0),(.2,0)]],
 '1':[[ (.2,.78),(.55,1),(.55,0)],[(.2,0),(.9,0)]],
 'P':[[(0,0),(0,1),(.75,1),(1,.8),(1,.62),(.75,.5),(0,.5)]],
 'U':[[(0,1),(0,.2),(.2,0),(.8,0),(1,.2),(1,1)]],
 'M':[[(0,0),(0,1),(.5,.5),(1,1),(1,0)]],
 'D':[[(0,0),(0,1),(.6,1),(1,.7),(1,.3),(.6,0),(0,0)]],
 'N':[[(0,0),(0,1),(1,0),(1,1)]],
 'O':[[(.2,0),(0,.22),(0,.78),(.2,1),(.8,1),(1,.78),(1,.22),(.8,0),(.2,0)]],
}

def label_patch(s,mat,c,r,y0,y1,width,segments=48):
    for k in range(segments):
        t0=(-width/2+width*k/segments)/r;t1=(-width/2+width*(k+1)/segments)/r
        p=lambda t,y:add(c,(r*math.sin(t),y,r*math.cos(t)))
        a=p(t0,y0);b=p(t1,y0);cc=p(t1,y1);d=p(t0,y1)
        s.tri(mat,a,b,cc);s.tri(mat,a,cc,d)

def label_text(s,text,c,r,y,height,width,mat='ink',stroke=.0014):
    char=width/(len(text)*1.45-.45)
    start=-width/2
    def p(x,yy):return add(c,(r*math.sin(x/r),yy,r*math.cos(x/r)))
    for j,ch in enumerate(text):
        for line in GLYPHS.get(ch,[]):
            for a,b in zip(line,line[1:]):
                ax=start+j*char*1.45+a[0]*char;bx=start+j*char*1.45+b[0]*char
                ay=y+a[1]*height;by=y+b[1]*height
                vx,vy=bx-ax,by-ay;ll=math.hypot(vx,vy)
                if ll<1e-8:continue
                dx,dy=-vy/ll*stroke/2,vx/ll*stroke/2
                q=[p(ax-dx,ay-dy),p(bx-dx,by-dy),p(bx+dx,by+dy),p(ax+dx,ay+dy)]
                s.tri(mat,*q[:3]);s.tri(mat,q[0],q[2],q[3])

def leaf(s,base,tip,width,mat,twist=0):
    axis=norm(sub(tip,base));side=norm(cross(axis,(0,1,.25)))
    for j in range(12):
        ta=j/12;tb=(j+1)/12
        def v(t,across):
            mid=lerp(base,tip,t);w=width*math.sin(math.pi*t)**.85*across
            return add(add(mid,mul(side,w)),(0,.035*math.sin(math.pi*t)*(1-across*across),0))
        for a,b in [(-1,0),(0,1)]:
            aa=v(ta,a);bb=v(tb,a);cc=v(tb,b);dd=v(ta,b)
            s.tri(mat,aa,bb,cc);s.tri(mat,aa,cc,dd)
    s.cylinder('vein',base,tip,.0014,.0003,segments=5)

def build():
    s=Scene()
    s.camera((2.25,1.82,4.50),(-.04,.91,0),fov=25.2,aperture=.012)
    s.env((.25,.28,.23),(.28,.31,.28),.12)
    s.mat('background',(.46,.49,.40),rough=.8,tex=1,scale=2,bump=.00015)
    s.mat('limestone',(.61,.57,.47),kind=4,rough=.68,tex=3,scale=9,bump=.0004)
    s.mat('glass',(.39,.72,.45),kind=2,rough=0,ior=1.51)
    s.mat('brass',(.74,.48,.19),kind=1,rough=.21,tex=0)
    s.mat('brassTop',(.68,.43,.16),kind=1,rough=.31,tex=1,scale=12,bump=.00015)
    s.mat('seal',(.025,.025,.019),kind=4,rough=.31)
    s.mat('label',(.80,.75,.61),rough=.72,tex=5,scale=10,bump=.00004)
    s.mat('ink',(.045,.06,.045),rough=.6)
    s.mat('olive',(.105,.16,.068),kind=4,rough=.42,tex=1,scale=7,bump=.0001)
    s.mat('oliveBack',(.23,.26,.13),rough=.75,tex=1,scale=4,bump=.00015)
    s.mat('stem',(.13,.105,.042),rough=.6,tex=2,scale=6)
    s.mat('vein',(.22,.25,.095),rough=.68)
    s.mat('key',(8.2,7.9,6.9),kind=3)
    s.mat('strip',(7.8,8.5,8.2),kind=3)
    s.mat('top',(4.6,4.4,3.8),kind=3)
    s.quad('background',(-50,0,50),(100,0,0),(0,0,-100))
    # Seamless floor-to-background sweep, curved in the YZ section.
    path=[(-4.0,0.0)]
    for k in range(1,33):
        th=math.pi/2*k/32;path.append((-4-math.sin(th)*1.6,1.6*(1-math.cos(th))))
    path.append((-5.6,12))
    for (z0,y0),(z1,y1) in zip(path,path[1:]):
        s.quad('background',(-20,y0,z0),(40,0,0),(0,y1-y0,z1-z0))
    # Broad low limestone cylinder with actual bevel profile.
    s.lathe('limestone',[(0,.005),(.78,.005),(.85,.018),(.87,.04),(.87,.25),(.85,.275),(.80,.282),(0,.282)],center=(-.05,0,0),segments=144)
    c=(-.19,.283,-.025)
    profile=[(0,0),(.28,0),(.346,.014),(.377,.04),(.392,.08),(.396,.15),(.396,.84),(.393,.92),(.38,.97),(.35,1.015),(.255,1.085),(.19,1.12),(.185,1.16),(.185,1.245),(.157,1.245),(.157,1.15),(.17,1.12),(.237,1.064),(.324,1.0),(.352,.944),(.364,.89),(.364,.16),(.35,.109),(.29,.085),(0,.085)]
    s.lathe('glass',profile,c,segments=144)
    s.lathe('seal',[(0,1.177),(.20,1.177),(.208,1.185),(.208,1.21),(.20,1.216),(0,1.216)],c,segments=112)
    cap=[(0,1.21),(.227,1.21),(.239,1.222),(.244,1.246),(.244,1.414),(.24,1.435),(.227,1.446),(0,1.446)]
    s.lathe('brass',cap,c,segments=144)
    s.lathe('brassTop',[(0,1.447),(.221,1.447),(.225,1.451),(.221,1.455),(0,1.455)],c,segments=112)
    for k in range(112):
        t=2*math.pi*k/112;dx,dz=.244*math.cos(t),.244*math.sin(t)
        s.cylinder('brass',add(c,(dx,1.248,dz)),add(c,(dx,1.411,dz)),.00125,segments=4)
    label_patch(s,'label',c,.399,.285,.80,.52)
    label_text(s,'ATELIER',c,.3994,.663,.050,.385,stroke=.002)
    label_text(s,'01',c,.3995,.448,.105,.115,stroke=.0025)
    label_text(s,'EAU DE PARFUM',c,.3995,.355,.016,.32,stroke=.00085)
    # Fine rules along the typography, all in actual label geometry.
    label_patch(s,'ink',c,.3995,.621,.622,.34,segments=28)
    label_patch(s,'ink',c,.3995,.398,.399,.34,segments=28)
    # Olives and a natural curved twig occupy a small strip of the foreground.
    pts=[]
    for k in range(21):
        t=k/20;pts.append((.15+1.0*t,.027+.04*math.sin(t*math.pi),.85-.40*t+.07*math.sin(t*4)))
    for k in range(20):s.cylinder('stem',pts[k],pts[k+1],.0045*(1-k/27),.0045*(1-(k+1)/27),segments=7)
    rng=random.Random(27)
    for k in [3,5,8,10,13,16,18]:
        b=pts[k];sg=-1 if k%2 else 1
        t=add(b,(.04+.06*rng.random(),.025+rng.random()*.04,sg*(.18+rng.random()*.10)))
        leaf(s,b,t,.028+.007*rng.random(),'olive' if k%3 else 'oliveBack')
    # Large light cards produce real highlights and soft shadows.
    s.quad('key',(-3,.35,-1.4),(0,3.3,0),(0,0,3.7))
    s.quad('strip',(2.6,.4,-1.0),(0,0,.5),(0,3,0))
    s.quad('top',(-1.1,4,-.3),(2,0,0),(0,0,1.5))
    return s

if __name__=='__main__':build().write(sys.argv[1] if len(sys.argv)>1 else 'product.scene')
