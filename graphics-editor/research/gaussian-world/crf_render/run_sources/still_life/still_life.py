"""Warm afternoon still life. All geometry and surfaces are computed from code."""
import sys, math
from common import Scene
from arch_helpers import rounded_box,smooth_profile,olive_branch,cloth,curtain

def build():
    s=Scene()
    s.camera((2.45,2.05,6.4),(-.05,1.12,-.1),fov=30,aperture=.012,focus=6.95)
    s.env((.50,.59,.72),(.19,.30,.48),intensity=.22)
    s.sun((-.84,1.03,.38),(3.7,2.9,2.0),angle=.42)
    s.mat('plaster',(.72,.66,.56),tex=1,scale=3,bump=.0006)
    s.mat('linen',(.69,.64,.53),rough=.9,tex=5,scale=1.4,bump=.0004)
    s.mat('ceramic',(.67,.61,.49),kind=4,rough=.34,tex=4,scale=2,bump=.0004)
    s.mat('terracotta',(.36,.105,.052),kind=4,rough=.54,tex=4,scale=3,bump=.0006)
    s.mat('dark_clay',(.10,.055,.027),kind=4,rough=.42,tex=4,scale=3,bump=.0006)
    s.mat('glass',(.65,.91,.75),kind=2,rough=0,ior=1.50)
    s.mat('branch',(.11,.066,.025),tex=3,scale=8,bump=.0004)
    s.mat('leaf0',(.16,.19,.075),rough=.60)
    s.mat('leaf1',(.23,.25,.12),rough=.6)
    s.mat('leaf2',(.10,.14,.055),rough=.7)
    s.mat('pear',(.46,.32,.07),kind=4,rough=.5,tex=4,scale=5,bump=.0003)
    s.mat('window_fill',(.9,1.02,1.18),kind=3)
    for i in range(8):
        q=(i%3)*.012
        s.mat('oak'+str(i),(.38+q,.233+q*.6,.108+q*.4),kind=4,rough=.46,tex=2,scale=.9,bump=.0005)
        rounded_box(s,'oak'+str(i),(0,-.075,-2.05+i*.5),(6,.15,.497),radius=.009)
    s.box('plaster',(0,1.5,-2.7),(8,5,.18))
    # A physical window wall on the left creates angled mullion shadows.
    s.box('plaster',(-3.0,.35,-.2),(.18,.70,5.0))
    s.box('plaster',(-3.0,3.35,-.2),(.18,1.2,5.0))
    for z in [-2.45,.05,2.45]: s.box('plaster',(-3,1.7,z),(.2,2.1,.10))
    s.box('plaster',(-3,1.3,-.2),(.2,.075,5.0))
    s.quad('window_fill',(3.4,.8,-.6),(0,2.3,0),(0,0,3.5))
    curtain(s,'linen',1.0,3.8,0,4,-2.57,steps_x=100,steps_y=24)
    # Hand-thrown ceramic, hollow at its neck with a real inside wall.
    profile=[(.0,.018),(.22,.018),(.27,.04),(.33,.15),(.365,.35),(.35,.61),(.28,.82),(.16,.99),(.125,1.13),(.13,1.18),(.105,1.18),(.10,1.10),(.13,.97),(.25,.79),(.32,.59),(.33,.35),(.29,.16),(.20,.065),(.0,.065)]
    s.lathe('ceramic',smooth_profile(profile,3),center=(-.53,0,-.12),segments=112)
    for i,end in enumerate([(-1.31,2.46,-.11),(-.28,2.68,-.37),(.36,2.35,-.10)]):
        olive_branch(s,(-.53,1.07,-.12),end,seed=91+i,scale=.9)
    # Slight green glass bottle has explicit inner and outer surfaces.
    gp=[(0,.018),(.17,.018),(.20,.05),(.205,.64),(.18,.75),(.09,.83),(.075,1.02),(.087,1.035),(.069,1.045),(.058,1.01),(.063,.84),(.164,.73),(.184,.62),(.18,.06),(0,.06)]
    s.lathe('glass',smooth_profile(gp,3),center=(.61,.025,-.30),segments=112)
    cloth(s,'linen',-.05,1.75,-.55,1.75,y=.025,steps=50,angle=-.12,drop_edge=1.35)
    # Open terracotta bowl; matte interior reads through the broad rim.
    bowl=[(0,.025),(.19,.025),(.26,.075),(.34,.14),(.39,.245),(.385,.263),(.365,.263),(.34,.18),(.27,.105),(.18,.065),(0,.065)]
    s.lathe('terracotta',smooth_profile(bowl,3),center=(.58,.04,.70),segments=112)
    pear=[(0,0),(.07,.015),(.113,.07),(.12,.15),(.095,.21),(.045,.28),(.033,.31),(0,.32)]
    s.lathe('pear',smooth_profile(pear,4),center=(.52,.115,.68),segments=64)
    s.cylinder('branch',(.52,.42,.68),(.54,.48,.67),.009,.004,segments=10)
    # Low dark dish at left supplies a grounded secondary silhouette.
    dish=[(0,.01),(.22,.01),(.27,.03),(.30,.06),(.29,.08),(.25,.06),(.18,.037),(0,.035)]
    s.lathe('dark_clay',smooth_profile(dish,3),center=(-.83,.005,.74),segments=80)
    return s

if __name__=='__main__': build().write(sys.argv[1] if len(sys.argv)>1 else 'still_life.scene')
