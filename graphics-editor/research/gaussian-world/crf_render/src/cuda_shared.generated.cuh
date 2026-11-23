// GENERATED from src/renderer.cpp by tools/generate_cuda_shared.py.
// Do not edit. CPU reference SHA256: b016786233f2360cc5fe419f8d9e58d278cd7ac20d8f6054763dfa0d0db4dc4c
#pragma once
#include <cuda_runtime.h>
#include <cstdint>
#include <cmath>
namespace crfgpu {
#define HD __host__ __device__
template<class T> HD inline T gmax(T a,T b){return a>b?a:b;}
template<class T> HD inline T gmin(T a,T b){return a<b?a:b;}
template<class T> struct Span { T* data=nullptr; int count=0; HD T& operator[](int i) const{return data[i];} HD int size()const{return count;} HD bool empty()const{return count==0;} };
constexpr float PI=3.14159265358979323846f, INF=1e30f;
struct V {
 float x=0,y=0,z=0;
 HD V()=default; HD V(float a):x(a),y(a),z(a){} HD V(float a,float b,float c):x(a),y(b),z(c){}
 HD float operator[](int i)const{return i==0?x:(i==1?y:z);} HD float& operator[](int i){return i==0?x:(i==1?y:z);}
 HD V operator-()const{return {-x,-y,-z};}
 HD V operator+(V b)const{return{x+b.x,y+b.y,z+b.z};} HD V operator-(V b)const{return{x-b.x,y-b.y,z-b.z};}
 HD V operator*(V b)const{return{x*b.x,y*b.y,z*b.z};} HD V operator*(float b)const{return{x*b,y*b,z*b};}
 HD V operator/(float b)const{return *this*(1/b);} HD V&operator+=(V b){*this=*this+b;return *this;}
 HD V&operator*=(V b){*this=*this*b;return *this;} HD V&operator*=(float b){*this=*this*b;return *this;}
};
HD V operator*(float a,V b){return b*a;} HD float dot(V a,V b){return a.x*b.x+a.y*b.y+a.z*b.z;}
HD V cross(V a,V b){return{a.y*b.z-a.z*b.y,a.z*b.x-a.x*b.z,a.x*b.y-a.y*b.x};}
HD float length(V a){return sqrtf(dot(a,a));} HD V norm(V a){return a/gmax(length(a),1e-20f);}
HD V vmin(V a,V b){return{gmin(a.x,b.x),gmin(a.y,b.y),gmin(a.z,b.z)};}
HD V vmax(V a,V b){return{gmax(a.x,b.x),gmax(a.y,b.y),gmax(a.z,b.z)};}
HD float maxc(V a){return gmax(a.x,gmax(a.y,a.z));} HD float lum(V a){return .2126f*a.x+.7152f*a.y+.0722f*a.z;}
HD float clamp(float a,float lo=0,float hi=1){return gmax(lo,gmin(hi,a));}
HD V clampv(V a,float lo=0,float hi=1){return{clamp(a.x,lo,hi),clamp(a.y,lo,hi),clamp(a.z,lo,hi)};}
HD V lerp(V a,V b,float t){return a*(1-t)+b*t;} HD float pow5(float x){float a=x*x;return a*a*x;}
struct RNG {
 uint64_t state;
 HD RNG(uint64_t s):state(s+0x9e3779b97f4a7c15ull){}
 HD uint64_t next(){uint64_t z=(state+=0x9e3779b97f4a7c15ull);z=(z^(z>>30))*0xbf58476d1ce4e5b9ull;z=(z^(z>>27))*0x94d049bb133111ebull;return z^(z>>31);}
 HD float u(){return float(next()>>40)*(1.f/16777216.f);}
};
struct Frame {V x,y,z; HD Frame(V n):z(n){V a=fabsf(n.y)<.999f?V(0,1,0):V(1,0,0);x=norm(cross(a,n));y=cross(n,x);} HD V world(V a)const{return x*a.x+y*a.y+z*a.z;} };
HD V cosine(V n,RNG&r){float p=2*PI*r.u(),rr=sqrtf(r.u());return Frame(n).world({rr*cosf(p),rr*sinf(p),sqrtf(gmax(0.f,1-rr*rr))});}
HD V cone(V n,float cosmax,RNG&r){float z=1-r.u()*(1-cosmax),p=2*PI*r.u(),q=sqrtf(gmax(0.f,1-z*z));return Frame(n).world({q*cosf(p),q*sinf(p),z});}
HD uint32_t hash3(int x,int y,int z){uint32_t h=uint32_t(x)*0x8da6b343u^uint32_t(y)*0xd8163841u^uint32_t(z)*0xcb1ab31fu;h^=h>>16;h*=0x7feb352du;h^=h>>15;h*=0x846ca68bu;return h^(h>>16);}
HD float noise(V p){int x=int(floorf(p.x)),y=int(floorf(p.y)),z=int(floorf(p.z));V f=p-V(float(x),float(y),float(z));f={f.x*f.x*(3-2*f.x),f.y*f.y*(3-2*f.y),f.z*f.z*(3-2*f.z)};float s=0;for(int k=0;k<2;k++)for(int j=0;j<2;j++)for(int i=0;i<2;i++)s+=float(hash3(x+i,y+j,z+k)>>8)*(1.f/16777216.f)*(i?f.x:1-f.x)*(j?f.y:1-f.y)*(k?f.z:1-f.z);return s;}
HD float fbm(V p){return .57143f*noise(p)+.28571f*noise(p*2.07f+V(8.1f,3.7f,1.3f))+.14286f*noise(p*4.31f+V(3.3f,7.2f,9.7f));}
struct Mat {int type=0,tex=0;V color=.8f;float rough=.4f,ior=1.5f,scale=1,bump=0;};
HD float heighttex(const Mat&m,V p){p=p*m.scale;switch(m.tex){case 2:{float phase=19.1f*m.color.x+71.7f*m.color.y+37.9f*m.color.z;float warp=fbm({p.x*.35f+phase,p.y*2,p.z*3});return .15f*noise({p.x*1.4f+phase,p.y*45,p.z*90+8*warp})+.018f*sinf(p.z*65+18*warp+phase);}case 5:return .13f*(sinf(p.x*500)*sinf(p.z*500));case 7:return .9f*sinf(p.z*32+2.2f*fbm(p*.55f))+.04f*noise(p*320);default:return noise(p*90)*.06f+noise(p*14)*.08f;}}
HD V albedo(const Mat&m,V p){if(m.tex==0)return m.color;p=p*m.scale;float a=1;switch(m.tex){case 1:a=.91f+.15f*fbm(p*7)+.045f*noise(p*160);break;case 2:{float phase=19.1f*m.color.x+71.7f*m.color.y+37.9f*m.color.z;float warp=fbm({p.x*.35f+phase,p.y*2,p.z*3});float grain=fbm({p.x*.8f+phase,p.y*28,p.z*42+9*warp});float pores=noise({p.x*2.5f+phase,p.y*110,p.z*180+15*warp});float ring=powf(gmax(0.f,sinf(p.z*48+22*warp+phase)),8.f);a=.96f+.16f*(grain-.5f)+.075f*(pores-.5f)-.055f*ring;break;}case 3:{float n=fbm(p*3),vein=powf(gmax(0.f,sinf(4*p.y+8*n)),14.f);a=.78f+.37f*fbm(p*13)-.14f*vein+.07f*noise(p*180);break;}case 4:{float grain=noise(p*280);a=.91f+.14f*fbm(p*5)+.055f*grain;if(grain<.22f)a*=.75f;break;}case 5:a=.90f+.055f*sinf(p.x*450)*sinf(p.z*450)+.10f*fbm(p*22);break;case 6:a=.67f+.55f*fbm(p*.8f)+.14f*noise(p*8);break;case 7:a=.91f+.09f*fbm(p*2)+.045f*noise(p*320)+.016f*cosf(p.z*32+2.2f*fbm(p*.55f));break;}return clampv(m.color*a,0,.99f);}
struct Ray {V o,d,inv;HD Ray(V a,V b):o(a),d(b){inv={1/(fabsf(b.x)<1e-20f?1e-20f:b.x),1/(fabsf(b.y)<1e-20f?1e-20f:b.y),1/(fabsf(b.z)<1e-20f?1e-20f:b.z)};} };
struct Box {V lo=INF,hi=-INF;HD void add(V p){lo=vmin(lo,p);hi=vmax(hi,p);}HD void add(Box b){add(b.lo);add(b.hi);}HD float area()const{V d=hi-lo;return 2*(d.x*d.y+d.y*d.z+d.z*d.x);} HD bool hit(const Ray&r,float mx,float &near)const{V a=(lo-r.o)*r.inv,b=(hi-r.o)*r.inv;V mn=vmin(a,b),ma=vmax(a,b);near=gmax(0.f,gmax(mn.x,gmax(mn.y,mn.z)));float far=gmin(mx,gmin(ma.x,gmin(ma.y,ma.z)));return near<=far;}};
struct Prim {int type=0,mat=0,light=-1;V a,b,c,ng,na,nb,nc;float rad=0;bool smooth=false;Box bounds;V center;};
struct Hit {float t=INF;V p,ng,n;int mat=-1,prim=-1;bool front=true;};
struct Node {Box b;int left=0,right=0,start=0,count=0;};
struct Area {V o,u,v,n,Le;float area;};

struct SceneView {
 Span<Mat> mats; Span<Prim> prims; Span<int> order; Span<Node> nodes; Span<Area> lights;
 V camO={0,2,5},target={0,1,0},eh={.4f,.45f,.5f},ez={.1f,.2f,.4f},sunD={0,1,0},sunC=0,fogC=0;
 float fov=40,aperture=0,focus=0,ei=0,sunAngle=.27f,sunCos=1,sunOmega=.0001f,fogD=0;int maxdepth=10;
 HD bool phit(int id,const Ray&r,Hit&h)const{const Prim&p=prims[id];float t;V gn,sn;if(p.type==1){V oc=r.o-p.a;float hb=dot(oc,r.d),cc=dot(oc,oc)-p.rad*p.rad,dis=hb*hb-cc;if(dis<0)return false;float sq=sqrtf(dis);t=-hb-sq;if(t<1e-5f)t=-hb+sq;if(t<1e-5f||t>=h.t)return false;gn=(r.o+r.d*t-p.a)/p.rad;sn=gn;}else{V pv=cross(r.d,p.c);float det=dot(p.b,pv);if(fabsf(det)<1e-9f)return false;float inv=1/det;V tv=r.o-p.a;float u=dot(tv,pv)*inv;if(u<0||u>1)return false;V q=cross(tv,p.b);float v=dot(r.d,q)*inv;if(v<0||u+v>1)return false;t=dot(p.c,q)*inv;if(t<1e-5f||t>=h.t)return false;gn=p.ng;sn=p.smooth?norm(p.na*(1-u-v)+p.nb*u+p.nc*v):gn;if(dot(sn,gn)<0)sn=-sn;}
 h.t=t;h.p=r.o+r.d*t;h.front=dot(r.d,gn)<0;h.ng=h.front?gn:-gn;h.n=h.front?sn:-sn;if(dot(h.n,-r.d)<.001f)h.n=h.ng;h.mat=p.mat;h.prim=id;return true;}
 HD bool hit(const Ray&r,Hit&h,bool any=false)const{if(nodes.empty())return false;int stack[128],sp=0;stack[sp++]=0;bool yes=false;while(sp){int ni=stack[--sp];const Node&nd=nodes[ni];float near;if(!nd.b.hit(r,h.t,near))continue;if(nd.count){for(int j=0;j<nd.count;j++)if(phit(order[nd.start+j],r,h)){yes=true;if(any)return true;}}else{float a,b;bool ha=nodes[nd.left].b.hit(r,h.t,a),hb=nodes[nd.right].b.hit(r,h.t,b);if(ha&&hb){if(a<b){stack[sp++]=nd.right;stack[sp++]=nd.left;}else{stack[sp++]=nd.left;stack[sp++]=nd.right;}}else if(ha)stack[sp++]=nd.left;else if(hb)stack[sp++]=nd.right;}}return yes;}
 HD V env(V d)const{float t=powf(clamp(d.y),.55f);return lerp(eh,ez,t)*ei;}
 HD float lightP()const{return 1.f/(lights.size()+(ei>0?1:0)+(maxc(sunC)>0?1:0));}
};
HD float Dggx(float nh,float a){float a2=a*a,q=nh*nh*(a2-1)+1;return a2/(PI*q*q);}
HD float G1(float nv,float a){if(nv<=0)return 0;return 2*nv/(nv+sqrtf(a*a+(1-a*a)*nv*nv));}
HD V fres(V f0,float vh){return f0+(V(1)-f0)*pow5(1-clamp(vh));}
struct BSDF {V f=0;float pdf=0;};
HD BSDF evaluate(const Mat&m,V c,V n,V v,V l){float nv=dot(n,v),nl=dot(n,l);if(nv<=0||nl<=0)return{};if(m.type==0)return{c/PI,nl/PI};V hv=v+l;if(dot(hv,hv)<1e-12)return{};V h=norm(hv);float nh=gmax(0.f,dot(n,h)),vh=gmax(0.f,dot(v,h)),a=gmax(.002f,m.rough*m.rough),D=Dggx(nh,a);V F=fres(m.type==1?c:V(.04f),vh);V spec=F*(D*G1(nv,a)*G1(nl,a)/(4*nv*nl));float ps=D*nh/gmax(4*vh,1e-10f);if(m.type==1)return{spec,ps};return{spec+c*(V(1)-F)/PI,.25f*ps+.75f*nl/PI};}
HD V sampleBsdf(const Mat&m,V n,V v,RNG&r){if(m.type==0||(m.type==4&&r.u()>.25f))return cosine(n,r);float a=gmax(.002f,m.rough*m.rough),u=gmin(r.u(),.999999f),ct=sqrtf((1-u)/(1+(a*a-1)*u)),st=sqrtf(gmax(0.f,1-ct*ct)),phi=2*PI*r.u();V h=Frame(n).world({st*cosf(phi),st*sinf(phi),ct});return norm(h*(2*dot(v,h))-v);}
HD float dielectricF(float cosi,float eta){float st2=eta*eta*(1-cosi*cosi);if(st2>=1)return 1;float ct=sqrtf(1-st2);float rp=(eta*cosi-ct)/(eta*cosi+ct),rs=(cosi-eta*ct)/(cosi+eta*ct);return .5f*(rp*rp+rs*rs);}
HD float power(float a,float b){float aa=a*a,bb=b*b;return aa/(aa+bb+1e-30f);}
HD V offset(V p,V ng,V d){float eps=gmax(2e-5f,2e-5f*maxc({fabsf(p.x),fabsf(p.y),fabsf(p.z)}));return p+ng*(dot(d,ng)>0?eps:-eps);}
HD V bumpnormal(const Mat&m,V p,V n){if(m.bump==0||m.tex==0)return n;Frame f(n);float eps=.0008f/gmax(m.scale,.01f);float h=heighttex(m,p),dx=(heighttex(m,p+f.x*eps)-h)/eps,dy=(heighttex(m,p+f.y*eps)-h)/eps;V d=(f.x*dx+f.y*dy)*m.bump;float len=length(d);if(len>.35f)d=d*(.35f/len);return norm(n-d);}
HD V direct(const SceneView&s,const Hit&h,const Mat&m,V col,V n,V v,RNG&r){int total=int(s.lights.size())+(s.ei>0?1:0)+(maxc(s.sunC)>0?1:0);if(!total)return V(0);int k=gmin(total-1,int(r.u()*total));float sel=1.f/total,pdf=0,dist=INF;V l,Le;bool sun=false;
 if(k<int(s.lights.size())){auto&a=s.lights[k];V p=a.o+a.u*r.u()+a.v*r.u();V d=p-h.p;dist=length(d);if(dist<1e-5f)return V(0);l=d/dist;float lc=fabsf(dot(a.n,-l));if(lc<1e-7f)return V(0);pdf=sel*dist*dist/(lc*a.area);Le=a.Le;}
 else if(s.ei>0&&k==int(s.lights.size())){l=cosine(n,r);pdf=sel*gmax(0.f,dot(n,l))/PI;Le=s.env(l);}
 else{l=cone(s.sunD,s.sunCos,r);pdf=sel/s.sunOmega;Le=s.sunC/s.sunOmega;sun=true;}
 float nl=dot(n,l);if(nl<=0||dot(h.ng,l)<=0||pdf<1e-20f)return V(0);Hit shadow;shadow.t=dist>=INF*.5f?INF:dist-gmax(.0001f,dist*1e-5f);if(s.hit(Ray(offset(h.p,h.ng,l),l),shadow,true))return V(0);BSDF b=evaluate(m,col,n,v,l);return Le*b.f*(nl*power(pdf,b.pdf)/pdf);}
HD V trace(const SceneView&s,Ray ray,RNG&r){V L=0,beta=1,prevP=0,prevN=0;bool spec=true;float prevPdf=0;int medium=-1;float firstDistance=INF;
 for(int depth=0;depth<s.maxdepth;depth++){
  Hit h;if(!s.hit(ray,h)){
   V e=s.env(ray.d);float ew=1;if(!spec&&s.ei>0)ew=power(prevPdf,s.lightP()*gmax(0.f,dot(prevN,ray.d))/PI);L+=beta*e*ew;
   if(maxc(s.sunC)>0&&dot(ray.d,s.sunD)>=s.sunCos){float w=spec?1:power(prevPdf,s.lightP()/s.sunOmega);L+=beta*(s.sunC/s.sunOmega)*w;}break;
  }
  if(depth==0)firstDistance=h.t;
  if(medium>=0){V c=s.mats[medium].color;beta*=V(powf(gmax(c.x,1e-6f),h.t),powf(gmax(c.y,1e-6f),h.t),powf(gmax(c.z,1e-6f),h.t));}
  const Mat&m=s.mats[h.mat];
  if(m.type==3){float w=1;int li=s.prims[h.prim].light;if(!spec&&li>=0){auto&a=s.lights[li];V d=h.p-prevP;float ds=dot(d,d),lc=fabsf(dot(a.n,-ray.d));float lp=s.lightP()*ds/gmax(lc*a.area,1e-20f);w=power(prevPdf,lp);}L+=beta*m.color*w;break;}
  V n=bumpnormal(m,h.p,h.n),v=-ray.d;
  if(dot(n,v)<=.001f)n=h.n;
  if(m.type==2){float eta=h.front?1/m.ior:m.ior,ci=clamp(dot(n,v));float F=dielectricF(ci,eta);V d;
   if(r.u()<F){d=norm(ray.d+n*(2*ci));if(dot(d,h.ng)<=0)d=norm(ray.d+h.ng*(2*dot(h.ng,v)));}
   else{float st2=eta*eta*(1-ci*ci);d=norm(ray.d*eta+n*(eta*ci-sqrtf(gmax(0.f,1-st2))));if(dot(d,h.ng)>=0){ci=clamp(dot(h.ng,v));st2=eta*eta*(1-ci*ci);if(st2>=1){d=norm(ray.d+h.ng*(2*ci));ray=Ray(offset(h.p,h.ng,d),d);spec=true;prevPdf=0;continue;}d=norm(ray.d*eta+h.ng*(eta*ci-sqrtf(1-st2)));}beta*=eta*eta;medium=h.front?h.mat:-1;}
   ray=Ray(offset(h.p,h.ng,d),d);spec=true;prevPdf=0;
  }else{
   V col=albedo(m,h.p);L+=beta*direct(s,h,m,col,n,v,r);V d=sampleBsdf(m,n,v,r);float nl=dot(n,d);if(nl<=0||dot(h.ng,d)<=0)break;BSDF b=evaluate(m,col,n,v,d);if(b.pdf<=1e-15f)break;beta*=b.f*(nl/b.pdf);prevPdf=b.pdf;prevP=h.p;prevN=n;spec=false;ray=Ray(offset(h.p,h.ng,d),d);
  }
  if(depth>=4){float p=clamp(maxc(beta),.05f,.95f);if(r.u()>p)break;beta*=1/p;}
  if(!isfinite(maxc(beta)))break;
 }
 if(s.fogD>0&&firstDistance<INF){float tr=expf(-s.fogD*firstDistance);L=L*tr+s.fogC*(1-tr);}return {gmax(0.f,L.x),gmax(0.f,L.y),gmax(0.f,L.z)};
}

#undef HD
} // namespace crfgpu
