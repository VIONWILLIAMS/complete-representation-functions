"""Alpine Mirror: an entirely procedural mountain-lake photograph.

No photos, texture bitmaps, learned models, or external meshes are read.
All units are meters; Y is up. The scene intentionally uses an analytically
approximated distance haze rather than a multiple-scattering atmosphere.
"""
import math
import random
import sys
from common import Scene


def clamp(x, a=0.0, b=1.0):
    return min(b, max(a, x))


def hash2(x, z, seed=17):
    n = (int(x) * 374761393 + int(z) * 668265263 + seed * 1442695041) & 0xFFFFFFFF
    n = ((n ^ (n >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((n ^ (n >> 16)) & 0xFFFFFF) / 16777215.0


def noise(x, z, seed=17):
    ix, iz = math.floor(x), math.floor(z)
    u, v = x - ix, z - iz
    u, v = u*u*(3-2*u), v*v*(3-2*v)
    a = hash2(ix, iz, seed)*(1-u) + hash2(ix+1, iz, seed)*u
    b = hash2(ix, iz+1, seed)*(1-u) + hash2(ix+1, iz+1, seed)*u
    return a*(1-v)+b*v


def fbm(x, z, seed=17, octaves=5):
    total = norm = 0.0
    amplitude = 0.5
    for k in range(octaves):
        total += amplitude * noise(x, z, seed + k*23)
        norm += amplitude
        x, z = x*2.07 + 13.5, z*2.07 - 7.1
        amplitude *= 0.48
    return total/norm


def unit(v):
    l = math.sqrt(sum(q*q for q in v))
    return tuple(q/l for q in v)


PEAKS = [(-70,-137,42,48,44), (-39,-132,61,44,40),
         (-15,-139,74,43,41), (6,-143,62,40,40),
         (31,-155,68,46,43), (58,-145,47,44,42),
         (-97,-98,28,47,45), (92,-102,33,46,43),
         (-49,-91,25,35,28), (48,-99,30,35,29)]


def mountain_height(x, z):
    h = 0.7
    wx = x + 3.4*(noise(x*.075,z*.062,31)-.5)
    wz = z + 4.2*(noise(x*.052,z*.085,53)-.5)
    for px, pz, ph, rx, rz in PEAKS:
        dx, dz = (wx-px)/rx, (wz-pz)/rz
        # A warped elliptical pyramid preserves sharp summits and long ridges.
        d = math.sqrt(dx*dx + dz*dz)
        shoulder = max(0, 1-d)
        local = ph * shoulder**.70
        h = max(h, local)
    envelope = clamp(h/15)
    h += envelope*(15.0*(fbm(x*.12,z*.12,7)-.5)
                   + 3.2*(noise(x*.33,z*.07,45)-.5))
    h -= 3.0*envelope*noise(x*.37, z*.021, 22)**3
    h += .55*envelope*math.sin(h*.68 + .15*x)
    return max(.25, h)


def landscape_mesh(s):
    nx, nz = 180, 100
    xmin, xmax, zmin, zmax = -146, 146, -204, -54
    verts, normals = [], []
    for j in range(nz+1):
        z=zmin+(zmax-zmin)*j/nz
        for i in range(nx+1):
            x=xmin+(xmax-xmin)*i/nx
            h=mountain_height(x,z)
            e=.4
            dx=(mountain_height(x+e,z)-mountain_height(x-e,z))/(2*e)
            dz=(mountain_height(x,z+e)-mountain_height(x,z-e))/(2*e)
            verts.append((x,h,z)); normals.append(unit((-dx,1,-dz)))
    def triangle(indices):
        vv=[verts[i] for i in indices]
        nn=[normals[i] for i in indices]
        x,y,z=[sum(p[k] for p in vv)/3 for k in range(3)]
        up=sum(n[1] for n in nn)/3
        snowline=49+8*noise(x*.06,z*.06,91)
        if y>snowline and (up>.4 or y>67):
            mat='snow'
        elif y<8.5+4*noise(x*.1,z*.1,55):
            mat='grass'+str(int(noise(x*.22,z*.2,43)*3.99))
        else:
            # Sedimentary strata are generated from position, never a bitmap.
            strata=math.sin(y*.49 + noise(x*.04,z*.04,12)*2.5)
            idx=int(clamp(.5+.26*strata+.38*(noise(x*.14,z*.14,82)-.5))*5.99)
            mat='rock'+str(idx)
        s.tri(mat,*vv,normals=nn)
    for j in range(nz):
        for i in range(nx):
            a=j*(nx+1)+i; b=a+1; c=a+nx+1; d=c+1
            triangle([a,c,b]); triangle([b,c,d])


def distant_range(s):
    # A real third range gives depth even without the analytical haze.
    nx,nz=80,15
    verts=[]
    for j in range(nz+1):
        z=-390+155*j/nz
        for i in range(nx+1):
            x=-340+680*i/nx
            shape=max(0,math.sin(math.pi*j/nz))
            h=shape*(31+30*fbm(x*.019,z*.019,112,4))
            verts.append((x,h,z))
    for j in range(nz):
        for i in range(nx):
            a=j*(nx+1)+i;b=a+1;c=a+nx+1;d=c+1
            s.tri('distant',verts[a],verts[c],verts[b])
            s.tri('distant',verts[b],verts[c],verts[d])


def water(s):
    # Long, small-amplitude wavelets. The smooth normals are analytical
    # derivatives, and the geometric surface is explicitly triangulated.
    nx,nz=110,82
    verts=[]; normals=[]
    for j in range(nz+1):
        z=-111+128*j/nz
        for i in range(nx+1):
            x=-104+208*i/nx
            a=.32*x+.63*z; b=.73*x-.19*z
            h=.007*math.sin(a)+.003*math.sin(b)
            dx=.007*.32*math.cos(a)+.003*.73*math.cos(b)
            dz=.007*.63*math.cos(a)-.003*.19*math.cos(b)
            verts.append((x,h,z)); normals.append(unit((-dx,1,-dz)))
    for j in range(nz):
        for i in range(nx):
            a=j*(nx+1)+i;b=a+1;c=a+nx+1;d=c+1
            for ids in ((a,c,b),(b,c,d)):
                s.tri('water',*(verts[k] for k in ids),normals=[normals[k] for k in ids])
    s.quad('lakebed',(-106,-3,-112),(212,0,0),(0,0,132))
    # Side faces close the water boundary beyond the camera's view.
    s.quad('water',(-104,-3,-111),(0,3,0),(208,0,0))
    s.quad('water',(-104,-3,17),(208,0,0),(0,3,0))
    s.quad('water',(-104,-3,-111),(0,0,128),(0,3,0))
    s.quad('water',(104,-3,-111),(0,3,0),(0,0,128))


def shoreline_height(x,z):
    edge=6.2+2.3*math.sin(x*.15)+2.5*math.sin(x*.047+1.6)
    d=z-edge
    return .047*d+.23*(fbm(x*.27,z*.31,32)-.42)-.04


def shore(s):
    nx,nz=78,31
    verts=[]
    for j in range(nz+1):
        z=-2+30*j/nz
        for i in range(nx+1):
            x=-42+90*i/nx
            verts.append((x,shoreline_height(x,z),z))
    for j in range(nz):
        for i in range(nx):
            a=j*(nx+1)+i;b=a+1;c=a+nx+1;d=c+1
            mid=verts[a]
            mat='shore'+str(int(noise(mid[0]*.37,mid[2]*.4,61)*2.99))
            s.tri(mat,verts[a],verts[c],verts[b]);s.tri(mat,verts[b],verts[c],verts[d])


def boulder(s,center,radii,seed,mat='shorestone'):
    nr,ns=(15,28) if max(radii)>1.4 else (7,12)
    verts=[]
    for j in range(nr+1):
        theta=math.pi*j/nr
        for i in range(ns):
            phi=2*math.pi*i/ns
            d=(math.sin(theta)*math.cos(phi),math.cos(theta),math.sin(theta)*math.sin(phi))
            amp=.82+.29*noise(d[0]*3+seed*.8,d[2]*3+d[1]*5,seed)
            verts.append(tuple(center[k]+radii[k]*d[k]*amp for k in range(3)))
    faces=[]
    for j in range(nr):
        for i in range(ns):
            a=j*ns+i;b=j*ns+(i+1)%ns;c=a+ns;d=b+ns
            if j>0:faces.append((a,b,c))
            if j<nr-1:faces.append((b,d,c))
    normals=[[0.,0.,0.] for _ in verts]
    for ids in faces:
        a,b,c=[verts[k] for k in ids]
        u=[b[k]-a[k] for k in range(3)];v=[c[k]-a[k] for k in range(3)]
        n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]
        for i in ids:
            for k in range(3):normals[i][k]+=n[k]
    for i,n in enumerate(normals):
        normals[i]=unit(n) if sum(q*q for q in n)>1e-15 else (0,1 if i<ns else -1,0)
    for ids in faces:
        s.tri(mat,*(verts[i] for i in ids),normals=[normals[i] for i in ids])


def pine(s,x,y,z,h,seed,near=False):
    rng=random.Random(seed)
    s.cylinder('bark',(x,y,z),(x+.06*h,y+h,z),.025*h,.006*h,segments=5)
    levels=7 if near else 5
    ns=10 if near else 7
    sway=rng.uniform(-.08,.08)*h
    for k in range(levels):
        frac=.18+.66*k/(levels-1)
        r=.255*h*(1-frac)*(rng.uniform(.84,1.15))
        by=y+h*frac;ty=min(y+h,by+h*.22)
        ring=[]
        for i in range(ns):
            p=2*math.pi*i/ns+rng.uniform(-.15,.15)
            rr=r*rng.uniform(.74,1.19)
            ring.append((x+sway*frac+rr*math.cos(p),by+rng.uniform(-.055,.045)*h,z+rr*math.sin(p)))
        top=(x+sway*(frac+.2),ty,z+rng.uniform(-.035,.035)*h)
        bottom=(x+sway*frac,by+.015*h,z)
        for i in range(ns):
            a,b=ring[i],ring[(i+1)%ns]
            mat='pine'+str(rng.randrange(4))
            s.tri(mat,a,b,top)
            s.tri('pine0',b,a,bottom)
    if near:
        # Individual twig fans break the regular canopy outline at near distance.
        for k in range(18):
            frac=rng.uniform(.22,.8);theta=rng.uniform(0,2*math.pi)
            p=(x+sway*frac,y+h*frac,z)
            reach=h*.25*(1-frac)
            tip=(p[0]+reach*math.cos(theta),p[1]-.03*h,p[2]+reach*math.sin(theta))
            s.cylinder('bark',p,tip,.012*h,.003*h,segments=4)


def forest(s):
    rng=random.Random(63009)
    # Trees cluster in several uneven bands, leaving the central reflections open.
    for k in range(185):
        x=rng.uniform(-116,111)
        z=rng.uniform(-83,-58)
        h0=mountain_height(x,z)
        if h0>21:continue
        h=rng.uniform(3.0,7.4)*(1-.25*clamp((h0-9)/20))
        pine(s,x,h0-.1,z,h,960+k)
    # A forested left peninsula, partially reflected in the lake.
    for k in range(38):
        x=rng.uniform(-74,-40);z=rng.uniform(-44,-15)
        ground=1.0+1.6*fbm(x*.06,z*.06,22)
        boulder(s,(x,.05,z),(rng.uniform(2,4),ground,rng.uniform(2,4)),220+k,'mossrock')
        pine(s,x,ground*.72,z,rng.uniform(4,8.4),1200+k)


def foreground(s):
    rng=random.Random(210419)
    boulder(s,(14.0,.54,5.8),(2.5,1.25,1.7),161)
    boulder(s,(17.4,.18,6.6),(1.3,.7,1.06),162)
    boulder(s,(-0.8,.14,4.8),(1.8,.7,1.13),163)
    for k in range(48):
        x=rng.uniform(-25,29);z=rng.uniform(5,19)
        y=shoreline_height(x,z)
        if y<-.04:continue
        radius=rng.uniform(.05,.29)
        boulder(s,(x,y+radius*.32,z),(radius*1.3,radius*.63,radius),300+k)
    # Fine reed stems and blade ribbons, all explicit geometry.
    for k in range(65):
        x=rng.uniform(-18,-11) if k<30 else rng.uniform(17,24)
        z=rng.uniform(5.4,11.5);y=shoreline_height(x,z)
        if y<-.12:continue
        h=rng.uniform(.2,.85);theta=rng.uniform(0,2*math.pi)
        bend=rng.uniform(.13,.35)
        tip=(x+bend*math.cos(theta),y+h,z+bend*math.sin(theta))
        mid=(x+.025*math.cos(theta),y+h*.55,z+.025*math.sin(theta))
        width=rng.uniform(.009,.02)
        side=(width*math.cos(theta+1.57),0,width*math.sin(theta+1.57))
        s.tri('reed',(x-side[0],y,z-side[2]),(x+side[0],y,z+side[2]),mid)
        s.tri('reed',(mid[0]-side[0],mid[1],mid[2]-side[2]),(mid[0]+side[0],mid[1],mid[2]+side[2]),tip)


def build():
    s=Scene()
    s.camera((10,3.8,18),(-3,18,-119),fov=52,aperture=0.0)
    s.env((.64,.72,.78),(.10,.22,.42),intensity=.40)
    s.sun((-0.86,.41,.30),(3.9,3.22,2.42),angle=.32)
    s.fog(.00125,(.33,.44,.58))
    s.mat('water',(.52,.87,.83),kind=2,rough=0,ior=1.333)
    s.mat('lakebed',(.115,.20,.16),tex=3,scale=.7,bump=.0002)
    s.mat('snow',(.74,.79,.82),rough=.7,tex=1,scale=.7,bump=.0001)
    s.mat('distant',(.28,.36,.43),rough=.8)
    for k in range(6):
        f=.57+.095*k
        s.mat('rock'+str(k),(.40*f,.365*f,.30*f),rough=.85,tex=3,scale=.55,bump=.00018)
    for k in range(4):
        f=.72+.14*k
        s.mat('grass'+str(k),(.095*f,.145*f,.061*f),rough=.9,tex=3,scale=.8,bump=.00012)
        s.mat('pine'+str(k),(.022+.009*k,.052+.014*k,.030+.007*k),rough=.85,tex=1,scale=2)
    s.mat('bark',(.082,.053,.031),rough=.9,tex=2,scale=1.8)
    s.mat('mossrock',(.14,.17,.095),rough=.9,tex=3,scale=2,bump=.00018)
    s.mat('shorestone',(.31,.33,.31),rough=.88,tex=3,scale=3,bump=.00018)
    for k in range(3):
        f=.84+.11*k
        s.mat('shore'+str(k),(.31*f,.28*f,.21*f),rough=.94,tex=3,scale=3,bump=.00018)
    s.mat('reed',(.19,.22,.068),rough=.85)
    distant_range(s)
    landscape_mesh(s)
    water(s)
    shore(s)
    forest(s)
    foreground(s)
    return s


if __name__=='__main__':
    scene=build()
    scene.write(sys.argv[1] if len(sys.argv)>1 else 'landscape.scene')
