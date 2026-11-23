"""Deterministic geometric helpers authored for the CRF scene experiments.
No imported images, model assets or textures are used.
"""
import math, random

def add(a,b): return tuple(a[i]+b[i] for i in range(3))
def sub(a,b): return tuple(a[i]-b[i] for i in range(3))
def mul(a,s): return tuple(x*s for x in a)
def dot(a,b): return sum(a[i]*b[i] for i in range(3))
def cross(a,b): return (a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])
def norm(a):
    q=math.sqrt(dot(a,a))
    return mul(a,1/q) if q>1e-10 else (0,1,0)

def smooth_profile(profile, steps=5):
    result=[]
    for i in range(len(profile)-1):
        p0=profile[max(i-1,0)];p1=profile[i];p2=profile[i+1];p3=profile[min(i+2,len(profile)-1)]
        for j in range(steps):
            t=j/steps
            result.append(tuple(.5*((2*p1[k])+(-p0[k]+p2[k])*t+(2*p0[k]-5*p1[k]+4*p2[k]-p3[k])*t*t+(-p0[k]+3*p1[k]-3*p2[k]+p3[k])*t*t*t) for k in range(2)))
    result.append(profile[-1]);return [(max(0,r),h) for r,h in result]

def rounded_box(scene,mat,center,size,radius=.04,rotation_y=0):
    """Rounded cuboid with analytic vertex normals; no bevel modifier."""
    half=[x/2 for x in size];radius=min(radius,min(half)*.8)
    c=math.cos(rotation_y);si=math.sin(rotation_y)
    def rot(v):return (c*v[0]+si*v[2],v[1],-si*v[0]+c*v[2])
    axes=[]
    for h in half:
        core=h-radius
        vals=[-h,-h+radius*.07,-h+radius*.29,-h+radius*.62,-core,0,core,h-radius*.62,h-radius*.29,h-radius*.07,h]
        axes.append(sorted(set(vals)))
    for d in range(3):
      a=(d+1)%3;b=(d+2)%3
      for side in [-1,1]:
        verts=[];normals=[]
        for u in axes[a]:
          row=[];nrow=[]
          for v in axes[b]:
            p=[0.,0.,0.];p[d]=side*half[d];p[a]=u;p[b]=v
            core=[max(-half[k]+radius,min(half[k]-radius,p[k])) for k in range(3)]
            n=norm(sub(p,core));pos=add(core,mul(n,radius))
            row.append(add(center,rot(pos)));nrow.append(rot(n))
          verts.append(row);normals.append(nrow)
        for i in range(len(axes[a])-1):
          for j in range(len(axes[b])-1):
            ids=[(i,j),(i+1,j),(i+1,j+1),(i,j+1)]
            if side<0:ids=ids[::-1]
            pp=[verts[ii][jj] for ii,jj in ids];nn=[normals[ii][jj] for ii,jj in ids]
            scene.tri(mat,pp[0],pp[1],pp[2],normals=(nn[0],nn[1],nn[2]))
            scene.tri(mat,pp[0],pp[2],pp[3],normals=(nn[0],nn[2],nn[3]))

def leaf(scene,mat,base,tip,width,twist=0):
    """Lanceolate leaf with tapered outline, arched midrib and folded sides."""
    axis=norm(sub(tip,base));u=norm(cross(axis,(.2,.9,.3)))
    v=norm(cross(axis,u));u=add(mul(u,math.cos(twist)),mul(v,math.sin(twist)))
    v=norm(cross(axis,u));length=math.sqrt(dot(sub(tip,base),sub(tip,base)))
    rows=[]
    for i in range(9):
      t=i/8;mid=add(add(base,mul(sub(tip,base),t)),mul(v,length*.13*math.sin(t*math.pi)))
      wid=width*(math.sin(math.pi*t)**.8)
      rows.append([add(add(mid,mul(u,sgn*wid)),mul(v,-abs(sgn)*width*.22*math.sin(math.pi*t))) for sgn in [-1,0,1]])
    for i in range(8):
      for j in range(2):
        scene.tri(mat,rows[i][j],rows[i+1][j],rows[i+1][j+1])
        scene.tri(mat,rows[i][j],rows[i+1][j+1],rows[i][j+1])

def twig(scene,mat,points,radius=.012):
    for i in range(len(points)-1):
        f=1-i/len(points)
        scene.cylinder(mat,points[i],points[i+1],radius*f,radius*(1-(i+1)/len(points))+.0003,segments=8)

def olive_branch(scene,base,end,seed=1,scale=1.,leaf_mats=('leaf0','leaf1','leaf2'),stem_mat='branch'):
    rng=random.Random(seed);length=math.sqrt(dot(sub(end,base),sub(end,base)));axis=norm(sub(end,base))
    points=[]
    for i in range(9):
      t=i/8;points.append(add(add(base,mul(sub(end,base),t)),(.08*scale*math.sin(t*3.9),0,.07*scale*math.sin(t*3.3))))
    twig(scene,stem_mat,points,.010*scale)
    tangent=norm(cross(axis,(0,0,1)))
    for i in range(2,9):
      p=points[i];f=i/8
      for side in [-1,1]:
        side_dir=norm(add(mul(tangent,side),(.2*rng.uniform(-1,1),.25,.55*rng.uniform(-1,1))))
        out=add(p,mul(side_dir,rng.uniform(.12,.24)*scale))
        tip=add(out,mul(axis,rng.uniform(.06,.13)*scale))
        scene.cylinder(stem_mat,p,out,.0024*scale,.0012*scale,segments=6)
        leaf(scene,rng.choice(leaf_mats),out,tip,.017*scale,rng.uniform(-.6,.6))
        if i<7:
          lower=add(p,mul(sub(out,p),.64));tip2=add(add(lower,mul(axis,.11*scale)),mul(side_dir,.04*scale))
          leaf(scene,rng.choice(leaf_mats),lower,tip2,.018*scale,rng.uniform(-1,1))

def cloth(scene,mat,xmin,xmax,zmin,zmax,y=.035,steps=36,angle=0,drop_edge=None):
    c=math.cos(angle);si=math.sin(angle)
    def pos(i,j):
      x=xmin+(xmax-xmin)*i/steps;z=zmin+(zmax-zmin)*j/steps
      yy=y+.011*math.sin(17*x+4*z)+.008*math.cos(22*z-3*x)+.008*math.sin(8*x+9*z)
      if drop_edge is not None and z>drop_edge:
        d=z-drop_edge;zz=drop_edge+.10*math.sin(min(d/.10,math.pi/2));yy-=d*.9;z=zz
      return (c*x+si*z,yy,-si*x+c*z)
    for i in range(steps):
      for j in range(steps):
        a=pos(i,j);b=pos(i+1,j);c1=pos(i+1,j+1);d=pos(i,j+1)
        scene.tri(mat,a,c1,b);scene.tri(mat,a,d,c1)

def curtain(scene,mat,xmin,xmax,ymin,ymax,z,steps_x=72,steps_y=24):
    def pos(i,j):
      x=xmin+(xmax-xmin)*i/steps_x;y=ymin+(ymax-ymin)*j/steps_y
      zz=z+.10*math.sin((x-xmin)*20)+.025*math.sin(x*39)+.018*math.sin(y*2.4+x*7)
      return(x,y,zz)
    for i in range(steps_x):
      for j in range(steps_y):
        a=pos(i,j);b=pos(i+1,j);c=pos(i+1,j+1);d=pos(i,j+1)
        scene.tri(mat,a,b,c);scene.tri(mat,a,c,d)
