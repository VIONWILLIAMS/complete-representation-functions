"""Wind / 05 — analytical dune ridges, procedural sand, and a low sun.

The geometry is a continuous family of asymmetrical aeolian ridges. The main
crest is an explicit mesh row with separate windward/slip-face normals, not a
heightmap photograph. Texture mode 7 is the C++ renderer's mathematical sand
ripple and grain function. No image or mesh asset is loaded.
"""
import math
import sys
from common import Scene


def unit(v):
    n=math.sqrt(sum(a*a for a in v))
    return tuple(a/n for a in v)


def crest(x,k=0):
    offsets=(-17,-62,-116,-174,-240,-316,-402)
    return offsets[k]+.17*x+14.0*math.sin(x*.049+1.2+k*.9)+3.0*math.sin(x*.093+k*1.5)-4


def height(x,z):
    h=.30+.15*math.sin(x*.023+z*.016)
    for k in range(7):
        dz=z-crest(x,k)
        H=(8.7,11.5,14.7,18.,21.,24.,26.)[k]
        H*=1+.12*math.sin(x*.036+k*.7)+.05*math.cos(x*.08-k)
        wind=(39,42,46,49,55,62,66)[k]
        slip=(12,14,16,19,20,22,24)[k]
        if dz>=0 and dz<wind:
            v=H*(1-dz/wind)**1.75
        elif -slip<dz<0:
            v=H*(1+dz/slip)**1.06
        else:
            v=0.
        h=max(h,v)
    return h


def normal(x,z,side=0):
    # At the hero ridge the two sides retain their independent slope normals.
    e=.009
    if side:
        z+=side*.025
    dx=(height(x+e,z)-height(x-e,z))/(2*e)
    dz=(height(x,z+e)-height(x,z-e))/(2*e)
    return unit((-dx,1,-dz))


def build():
    s=Scene()
    s.camera((18,38,30),(-8,3,-47),fov=40,aperture=0.)
    s.env((.52,.59,.70),(.09,.19,.34),intensity=.33)
    s.sun((-.65,.35,.67),(4.7,3.52,2.36),angle=.27)
    s.fog(.0018,(.39,.37,.36))
    s.mat('sand',(.48,.30,.145),kind=0,rough=.8,tex=7,scale=.30,bump=.009)
    s.mat('far_sand',(.48,.30,.145),kind=0,rough=.8,tex=7,scale=.55,bump=.0013)
    s.quad('far_sand',(-3000,-.15,-3000),(6000,0,0),(0,0,6000))
    nx=230
    # Every crest is an explicit row, preventing the stair-step silhouette that
    # a uniform heightfield would make at this resolution.
    rowdefs=[('back',j/20) for j in range(20)]
    crest_rows={20:6}
    for k in range(6,0,-1):
        for j in range(30):rowdefs.append((k,j/30))
        crest_rows[len(rowdefs)]=k-1
    rowdefs += [('front',j/80) for j in range(81)]
    nz=len(rowdefs)-1
    xs=[185*math.sinh((i/nx*2-1)*2.7)/math.sinh(2.7) for i in range(nx+1)]
    verts=[];normals=[]
    for tag,u in rowdefs:
        for x in xs:
            if tag=='back':z=crest(x,6)-100*(1-u)
            elif tag=='front':z=crest(x,0)+70*u**1.20
            else:z=crest(x,tag)*(1-u)+crest(x,tag-1)*u
            verts.append((x,height(x,z),z))
            normals.append(normal(x,z))
    for j in range(nz):
        for i in range(nx):
            a=j*(nx+1)+i;b=a+1;c=a+nx+1;d=c+1
            for ids in ((a,c,b),(b,c,d)):
                nn=[]
                for idx in ids:
                    row=idx//(nx+1)
                    if row in crest_rows:
                        x,_,z=verts[idx]
                        nn.append(normal(x,z,-1 if j<row else 1))
                    else:
                        nn.append(normals[idx])
                s.tri('sand',*(verts[k] for k in ids),normals=nn)
    return s


if __name__=='__main__':
    build().write(sys.argv[1] if len(sys.argv)>1 else 'desert.scene')
