"""Small, deterministic procedural modelling toolkit for the CRF CPU renderer.
All geometry and material signals are constructed from equations; no image assets.
Units are arbitrary but consistent within a scene. Y is vertical.
"""
import math
from pathlib import Path

PI=math.pi
def add(a,b): return tuple(x+y for x,y in zip(a,b))
def sub(a,b): return tuple(x-y for x,y in zip(a,b))
def mul(a,s): return tuple(x*s for x in a)
def dot(a,b): return sum(x*y for x,y in zip(a,b))
def cross(a,b): return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])
def length(a): return math.sqrt(dot(a,a))
def norm(a): return mul(a,1/max(length(a),1e-20))
normalize=norm
def lerp(a,b,t): return add(mul(a,1-t),mul(b,t))
def rotate_y(v,t):
    c,s=math.cos(t),math.sin(t)
    return (c*v[0]+s*v[2],v[1],-s*v[0]+c*v[2])
def fmt(v): return ' '.join(format(float(x),'.9g') for x in v)

class Scene:
    def __init__(self):
        self.lines=['# CRF code-native scene; geometry + materials authored procedurally.']
        self.materials={}
        self.counts={'sphere':0,'triangles':0,'quads':0}
    def camera(self,origin,target,fov=40,aperture=0.,focus=0.):
        if focus<=0: focus=length(sub(target,origin))
        self.lines.append('camera '+fmt((*origin,*target,fov,aperture,focus)))
    def env(self,horizon,zenith,intensity=1):
        self.lines.append('env '+fmt((*horizon,*zenith,intensity)))
    def sun(self,direction,color,angle=.27):
        self.lines.append('sun '+fmt((*norm(direction),*color,angle)))
    def fog(self,density,color): self.lines.append('fog '+fmt((density,*color)))
    def mat(self,name,color,kind=0,rough=.4,ior=1.5,tex=0,scale=1,bump=0):
        if name in self.materials: raise ValueError('Duplicate material: '+name)
        self.materials[name]=dict(color=color,kind=kind,rough=rough,ior=ior,tex=tex,scale=scale,bump=bump)
        self.lines.append('mat '+name+' '+fmt((kind,*color,rough,ior,tex,scale,bump)))
        return name
    def sphere(self,mat,center,r):
        self.lines.append('sphere '+mat+' '+fmt((*center,r))); self.counts['sphere']+=1
    def tri(self,mat,a,b,c,normals=None):
        if length(cross(sub(b,a),sub(c,a)))<1e-12: return
        if normals is None: self.lines.append('tri '+mat+' '+fmt((*a,*b,*c)))
        else: self.lines.append('trin '+mat+' '+fmt((*a,*b,*c,*normals[0],*normals[1],*normals[2])))
        self.counts['triangles']+=1
    def quad(self,mat,origin,u,v):
        self.lines.append('quad '+mat+' '+fmt((*origin,*u,*v))); self.counts['quads']+=1
    def box(self,mat,center,size,rotation_y=0):
        hx,hy,hz=(v/2 for v in size)
        faces=[((-hx,-hy,-hz),(0,0,2*hz),(0,2*hy,0)),
               ((hx,-hy,hz),(0,0,-2*hz),(0,2*hy,0)),
               ((-hx,hy,hz),(2*hx,0,0),(0,0,-2*hz)),
               ((-hx,-hy,-hz),(2*hx,0,0),(0,0,2*hz)),
               ((-hx,-hy,hz),(2*hx,0,0),(0,2*hy,0)),
               ((hx,-hy,-hz),(-2*hx,0,0),(0,2*hy,0))]
        for p,u,v in faces:
            self.quad(mat,add(center,rotate_y(p,rotation_y)),rotate_y(u,rotation_y),rotate_y(v,rotation_y))
    def lathe(self,mat,profile,center=(0,0,0),segments=96):
        # Profile follows outer bottom to outer top, then inner rim to inner bottom.
        n=len(profile); ns=[]
        for j,(r,y) in enumerate(profile):
            a=profile[max(j-1,0)]; b=profile[min(j+1,n-1)]
            dr=b[0]-a[0]; dy=b[1]-a[1]
            m=math.hypot(dr,dy) or 1
            ns.append((dy/m,-dr/m))
        for j in range(n-1):
            for k in range(segments):
                th0=2*PI*k/segments; th1=2*PI*(k+1)/segments
                vertices=[]; normals=[]
                for jj,th in ((j,th0),(j+1,th0),(j+1,th1),(j,th1)):
                    r,y=profile[jj]; co,si=math.cos(th),math.sin(th)
                    vertices.append(add(center,(r*co,y,r*si)))
                    normals.append((ns[jj][0]*co,ns[jj][1],ns[jj][0]*si))
                self.tri(mat,*vertices[:3],normals=normals[:3])
                self.tri(mat,vertices[0],vertices[2],vertices[3],normals=(normals[0],normals[2],normals[3]))
    def cylinder(self,mat,a,b,r0,r1=None,segments=20,cap=True):
        if r1 is None:r1=r0
        axis=sub(b,a); h=length(axis)
        if h<1e-9:return
        w=norm(axis); u=norm(cross(w,(0,1,0) if abs(w[1])<.98 else (1,0,0))); v=cross(w,u)
        for k in range(segments):
            ds=[]
            for kk in (k,k+1):
                th=2*PI*kk/segments; ds.append(add(mul(u,math.cos(th)),mul(v,math.sin(th))))
            a0=add(a,mul(ds[0],r0)); a1=add(a,mul(ds[1],r0))
            b0=add(b,mul(ds[0],r1)); b1=add(b,mul(ds[1],r1))
            n0=norm(add(ds[0],mul(w,(r0-r1)/h))); n1=norm(add(ds[1],mul(w,(r0-r1)/h)))
            self.tri(mat,a0,a1,b1,normals=(n0,n1,n1));self.tri(mat,a0,b1,b0,normals=(n0,n1,n0))
            if cap:
                self.tri(mat,a,a1,a0);self.tri(mat,b,b0,b1)
    def ellipsoid(self,mat,center,radii,segments=40,rings=20):
        def vertex(j,k):
            phi=PI*j/rings; th=2*PI*k/segments
            q=(math.sin(phi)*math.cos(th),math.cos(phi),math.sin(phi)*math.sin(th))
            return add(center,tuple(q[i]*radii[i] for i in range(3))),norm(tuple(q[i]/max(radii[i],1e-9) for i in range(3)))
        for j in range(rings):
            for k in range(segments):
                a,na=vertex(j,k); b,nb=vertex(j,k+1); c,nc=vertex(j+1,k+1); d,nd=vertex(j+1,k)
                self.tri(mat,a,b,c,normals=(na,nb,nc));self.tri(mat,a,c,d,normals=(na,nc,nd))
    def write(self,path):
        p=Path(path);p.parent.mkdir(parents=True,exist_ok=True)
        p.write_text('\n'.join(self.lines)+'\n')
        print(f'{p}: {self.counts}, {len(self.materials)} materials, {p.stat().st_size:,} bytes')
        return p
