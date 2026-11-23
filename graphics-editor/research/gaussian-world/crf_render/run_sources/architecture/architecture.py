"""Quiet Light: a completely procedural, sunlit architectural interior."""
import sys,math,random
from common import Scene
from arch_helpers import rounded_box,smooth_profile,olive_branch,curtain

def arch_wall(s,mat,z,cx,r,spring,height,left,right,depth=.28):
    # Wall solids outside the opening and actual curved reveal inside it.
    s.box(mat,((left+cx-r)/2,height/2,z),(cx-r-left,height,depth))
    s.box(mat,((cx+r+right)/2,height/2,z),(right-cx-r,height,depth))
    for side in [-1,1]:
        x=cx+side*r
        s.quad(mat,(x,0,z-depth/2),(0,spring,0),(0,0,depth))
    n=72
    for i in range(n):
        a=math.pi*i/n;b=math.pi*(i+1)/n
        x0=cx+r*math.cos(a);y0=spring+r*math.sin(a)
        x1=cx+r*math.cos(b);y1=spring+r*math.sin(b)
        for zz in [z-depth/2,z+depth/2]:
            s.tri(mat,(x0,y0,zz),(x1,y1,zz),(x1,height,zz))
            s.tri(mat,(x0,y0,zz),(x1,height,zz),(x0,height,zz))
        s.tri(mat,(x0,y0,z-depth/2),(x1,y1,z-depth/2),(x1,y1,z+depth/2))
        s.tri(mat,(x0,y0,z-depth/2),(x1,y1,z+depth/2),(x0,y0,z+depth/2))

def build():
    s=Scene()
    s.camera((3.1,1.7,5.6),(-.35,1.55,-3.45),fov=40,aperture=.0,focus=9.7)
    s.env((.55,.64,.78),(.19,.31,.50),intensity=.60)
    s.sun((-.90,1.0,.36),(4.4,3.45,2.35),angle=.36)
    s.mat('plaster',(.68,.625,.535),tex=1,scale=2,bump=.0004)
    s.mat('chalk',(.75,.70,.61),tex=1,scale=3,bump=.0004)
    s.mat('stone',(.49,.44,.35),kind=4,rough=.64,tex=3,scale=.8,bump=.0005)
    s.mat('linen',(.66,.61,.51),tex=5,scale=.7,bump=.0003)
    s.mat('linen_dark',(.32,.29,.23),tex=5,scale=.8,bump=.0004)
    s.mat('walnut',(.19,.085,.032),kind=4,rough=.43,tex=2,scale=.7,bump=.0004)
    s.mat('clay',(.25,.095,.048),kind=4,rough=.59,tex=4,scale=2,bump=.0005)
    s.mat('ceramic',(.64,.58,.44),kind=4,rough=.32,tex=4,scale=2,bump=.0004)
    s.mat('branch',(.12,.069,.026),tex=3,scale=5,bump=.0004)
    s.mat('leaf0',(.11,.15,.055),rough=.7)
    s.mat('leaf1',(.18,.22,.085),rough=.7)
    s.mat('leaf2',(.075,.11,.035),rough=.7)
    s.mat('window_sky',(.5,.59,.73),kind=3)
    s.mat('arch_fill',(.9,1.06,1.3),kind=3)
    # Individually modeled oak boards; subtle material differences and dark seams.
    s.mat('seams',(.045,.026,.012),rough=.8)
    s.box('seams',(0,-.09,1.5),(10,.1,14))
    for row in range(31):
        z=-5.1+row*.44
        for col in range(5):
            length=2.70;x=-5.4+col*2.7+(1.35 if row%2 else 0)
            xa=max(-5,x-length/2);xb=min(5,x+length/2)
            if xb<=xa:continue
            idx=(row*13+col*7)%9
            name='oak'+str(idx)
            if row==0 and col==0:
                for k in range(9):
                    v=(k-4)*.012
                    s.mat('oak'+str(k),(.40+v,.263+v*.8,.13+v*.5),kind=4,rough=.47,tex=2,scale=.65,bump=.0003)
            s.box(name,((xa+xb)/2,-.025,z),(xb-xa-.006,.065,.434))
    # Back wall pierced by a true arch leading into a small daylit courtyard.
    arch_wall(s,'plaster',-4.9,2.45,1.10,2.05,4.5,-5,5)
    s.box('plaster',(-5,2.25,-4.35),(.28,4.5,1.15))
    s.box('plaster',(-5,2.25,5.2),(.28,4.5,3.8))
    s.box('plaster',(-5,.30,-.1),(.28,.6,7.4))
    s.box('plaster',(-5,4.1,-.1),(.28,.8,7.4))
    # Window has mullions and sill; opening starts above floor.
    for z in [-3.8,-1.65,.5,2.65,3.65]:
        s.box('walnut',(-5.02,2.15,z),(.18,3.1,.075))
    rounded_box(s,'stone',(-4.94,.63,-.1),(.48,.13,7.4),radius=.018)
    s.box('plaster',(0,4.56,.7),(10.2,.18,11.6))
    # A low-powered fill panel is behind the camera; it does not occlude sun.
    s.quad('window_sky',(-3,1.0,8.5),(7,0,0),(0,2.2,0))
    s.box('plaster',(5.1,2.25,.3),(.25,4.5,11))
    # Limewashed courtyard glimpsed through the arch.
    s.box('stone',(2.4,-.025,-6.8),(4.6,.08,4.0))
    s.box('chalk',(2.4,2.25,-8.7),(4.6,4.5,.2))
    s.box('chalk',(.2,2.25,-6.8),(.2,4.5,4.0))
    s.quad('arch_fill',(1.1,4.25,-7.8),(2.8,0,0),(0,0,2.6))
    # Two actual outdoor olive saplings break up the view through the window.
    s.box('stone',(-8.0,-.1,-.4),(5.7,.15,10))
    for tree,base in enumerate([(-7.2,0,-2.8),(-8.3,0,.9)]):
        bx,by,bz=base
        s.cylinder('branch',base,(bx+.08,1.7,bz),.085,.038,segments=16)
        for j in range(10):
            theta=j*2.4+tree
            end=(bx+math.cos(theta)*1.03,2.15+(j%4)*.25,bz+math.sin(theta)*1.03)
            olive_branch(s,(bx+.06,1.12,bz),end,seed=110+tree*11+j,scale=1.5)
    # Architectural built-in oak bench and carefully rounded linen cushions.
    rounded_box(s,'walnut',(-2.35,.36,-3.99),(4.2,.55,1.22),radius=.035)
    for i in range(3):
        rounded_box(s,'linen',(-3.73+i*1.37,.71,-3.98),(1.34,.22,1.16),radius=.085)
        rounded_box(s,'linen',(-3.73+i*1.37,1.12,-4.46),(1.32,.70,.25),radius=.095)
    rounded_box(s,'linen_dark',(-3.9,.96,-4.1),(.59,.51,.21),radius=.075,rotation_y=-.20)
    rounded_box(s,'linen_dark',(-.95,.98,-4.09),(.62,.52,.23),radius=.08,rotation_y=.2)
    for x in [-4.45,-.25]:
        rounded_box(s,'walnut',(x,.84,-3.98),(.13,.32,1.25),radius=.045)
    # Minimal relief artwork is geometry, rather than a photo or a texture map.
    rounded_box(s,'linen',(-2.7,2.55,-4.70),(1.5,1.5,.05),radius=.017)
    s.cylinder('stone',(-2.7,2.60,-4.65),(-2.7,2.60,-4.61),.47,.47,segments=88)
    s.box('clay',(-2.7,2.13,-4.57),(.94,.11,.04))
    # Low sculptural travertine table with inset plinth.
    s.lathe('stone',smooth_profile([(0,.02),(.47,.02),(.48,.11),(.36,.49),(.36,.53),(0,.53)],3),center=(-.8,0,-1.37),segments=80)
    s.lathe('stone',smooth_profile([(0,.53),(.85,.53),(.90,.57),(.90,.66),(.86,.69),(0,.69)],3),center=(-.8,0,-1.37),segments=112)
    # A single ceramic object supplies scale without clutter.
    vase=[(0,0),(.16,0),(.22,.12),(.23,.30),(.18,.45),(.08,.53),(.075,.59),(.06,.59),(.06,.52),(.15,.42),(.195,.29),(.18,.12),(0,.04)]
    s.lathe('ceramic',smooth_profile(vase,3),center=(-.9,.69,-1.43),segments=88)
    olive_branch(s,(-.9,1.22,-1.43),(-1.15,1.89,-1.45),seed=18,scale=.60)
    # Thin wool rug defines a reading area, without photographic image maps.
    rounded_box(s,'linen',(-1.25,.018,-.55),(4.5,.025,3.35),radius=.008)
    # Rug was made after table, but is physically below the table feet.
    # Large earthen planter in the courtyard with procedurally branching olive.
    planter=[(0,0),(.27,0),(.31,.1),(.40,.65),(.41,.73),(.37,.75),(.35,.66),(.27,.12),(0,.10)]
    s.lathe('clay',smooth_profile(planter,3),center=(2.8,0,-7.2),segments=80)
    for i,end in enumerate([(2.0,2.5,-7.4),(3.5,2.7,-7.0),(2.8,3.2,-7.3),(3.55,2.2,-7.5)]):
        olive_branch(s,(2.8,.64,-7.2),end,seed=51+i,scale=1.3)
    return s

if __name__=='__main__': build().write(sys.argv[1] if len(sys.argv)>1 else 'architecture.scene')
