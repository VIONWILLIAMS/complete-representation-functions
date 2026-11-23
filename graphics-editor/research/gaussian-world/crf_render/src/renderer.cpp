// CRF experimental CPU path tracer. Original implementation, November 2026.
// No raster image or neural network is loaded. All radiance is computed here.
#include <algorithm>
#include <array>
#include <atomic>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <limits>
#include <numeric>
#include <sstream>
#include <stdexcept>
#include <string>
#include <unordered_map>
#include <vector>
#include <omp.h>
constexpr float PI=3.14159265358979323846f, INF=1e30f;
struct V {
 float x=0,y=0,z=0;
 V()=default; V(float a):x(a),y(a),z(a){} V(float a,float b,float c):x(a),y(b),z(c){}
 float operator[](int i)const{return i==0?x:(i==1?y:z);} float& operator[](int i){return i==0?x:(i==1?y:z);}
 V operator-()const{return {-x,-y,-z};}
 V operator+(V b)const{return{x+b.x,y+b.y,z+b.z};} V operator-(V b)const{return{x-b.x,y-b.y,z-b.z};}
 V operator*(V b)const{return{x*b.x,y*b.y,z*b.z};} V operator*(float b)const{return{x*b,y*b,z*b};}
 V operator/(float b)const{return *this*(1/b);} V&operator+=(V b){*this=*this+b;return *this;}
 V&operator*=(V b){*this=*this*b;return *this;} V&operator*=(float b){*this=*this*b;return *this;}
};
V operator*(float a,V b){return b*a;} float dot(V a,V b){return a.x*b.x+a.y*b.y+a.z*b.z;}
V cross(V a,V b){return{a.y*b.z-a.z*b.y,a.z*b.x-a.x*b.z,a.x*b.y-a.y*b.x};}
float length(V a){return std::sqrt(dot(a,a));} V norm(V a){return a/std::max(length(a),1e-20f);}
V vmin(V a,V b){return{std::min(a.x,b.x),std::min(a.y,b.y),std::min(a.z,b.z)};}
V vmax(V a,V b){return{std::max(a.x,b.x),std::max(a.y,b.y),std::max(a.z,b.z)};}
float maxc(V a){return std::max(a.x,std::max(a.y,a.z));} float lum(V a){return .2126f*a.x+.7152f*a.y+.0722f*a.z;}
float clamp(float a,float lo=0,float hi=1){return std::max(lo,std::min(hi,a));}
V clampv(V a,float lo=0,float hi=1){return{clamp(a.x,lo,hi),clamp(a.y,lo,hi),clamp(a.z,lo,hi)};}
V lerp(V a,V b,float t){return a*(1-t)+b*t;} float pow5(float x){float a=x*x;return a*a*x;}
std::istream&operator>>(std::istream&s,V&v){return s>>v.x>>v.y>>v.z;}
struct RNG {
 uint64_t state;
 RNG(uint64_t s):state(s+0x9e3779b97f4a7c15ull){}
 uint64_t next(){uint64_t z=(state+=0x9e3779b97f4a7c15ull);z=(z^(z>>30))*0xbf58476d1ce4e5b9ull;z=(z^(z>>27))*0x94d049bb133111ebull;return z^(z>>31);}
 float u(){return float(next()>>40)*(1.f/16777216.f);}
};
struct Frame {V x,y,z; Frame(V n):z(n){V a=std::abs(n.y)<.999f?V(0,1,0):V(1,0,0);x=norm(cross(a,n));y=cross(n,x);} V world(V a)const{return x*a.x+y*a.y+z*a.z;} };
V cosine(V n,RNG&r){float p=2*PI*r.u(),rr=std::sqrt(r.u());return Frame(n).world({rr*std::cos(p),rr*std::sin(p),std::sqrt(std::max(0.f,1-rr*rr))});}
V cone(V n,float cosmax,RNG&r){float z=1-r.u()*(1-cosmax),p=2*PI*r.u(),q=std::sqrt(std::max(0.f,1-z*z));return Frame(n).world({q*std::cos(p),q*std::sin(p),z});}
uint32_t hash3(int x,int y,int z){uint32_t h=uint32_t(x)*0x8da6b343u^uint32_t(y)*0xd8163841u^uint32_t(z)*0xcb1ab31fu;h^=h>>16;h*=0x7feb352du;h^=h>>15;h*=0x846ca68bu;return h^(h>>16);}
float noise(V p){int x=int(std::floor(p.x)),y=int(std::floor(p.y)),z=int(std::floor(p.z));V f=p-V(float(x),float(y),float(z));f={f.x*f.x*(3-2*f.x),f.y*f.y*(3-2*f.y),f.z*f.z*(3-2*f.z)};float s=0;for(int k=0;k<2;k++)for(int j=0;j<2;j++)for(int i=0;i<2;i++)s+=float(hash3(x+i,y+j,z+k)>>8)*(1.f/16777216.f)*(i?f.x:1-f.x)*(j?f.y:1-f.y)*(k?f.z:1-f.z);return s;}
float fbm(V p){return .57143f*noise(p)+.28571f*noise(p*2.07f+V(8.1f,3.7f,1.3f))+.14286f*noise(p*4.31f+V(3.3f,7.2f,9.7f));}
struct Mat {std::string name;int type=0,tex=0;V color=.8f;float rough=.4f,ior=1.5f,scale=1,bump=0;};
float heighttex(const Mat&m,V p){p=p*m.scale;switch(m.tex){case 2:{float phase=19.1f*m.color.x+71.7f*m.color.y+37.9f*m.color.z;float warp=fbm({p.x*.35f+phase,p.y*2,p.z*3});return .15f*noise({p.x*1.4f+phase,p.y*45,p.z*90+8*warp})+.018f*std::sin(p.z*65+18*warp+phase);}case 5:return .13f*(std::sin(p.x*500)*std::sin(p.z*500));case 7:return .9f*std::sin(p.z*32+2.2f*fbm(p*.55f))+.04f*noise(p*320);default:return noise(p*90)*.06f+noise(p*14)*.08f;}}
V albedo(const Mat&m,V p){if(m.tex==0)return m.color;p=p*m.scale;float a=1;switch(m.tex){case 1:a=.91f+.15f*fbm(p*7)+.045f*noise(p*160);break;case 2:{float phase=19.1f*m.color.x+71.7f*m.color.y+37.9f*m.color.z;float warp=fbm({p.x*.35f+phase,p.y*2,p.z*3});float grain=fbm({p.x*.8f+phase,p.y*28,p.z*42+9*warp});float pores=noise({p.x*2.5f+phase,p.y*110,p.z*180+15*warp});float ring=std::pow(std::max(0.f,std::sin(p.z*48+22*warp+phase)),8.f);a=.96f+.16f*(grain-.5f)+.075f*(pores-.5f)-.055f*ring;break;}case 3:{float n=fbm(p*3),vein=std::pow(std::max(0.f,std::sin(4*p.y+8*n)),14.f);a=.78f+.37f*fbm(p*13)-.14f*vein+.07f*noise(p*180);break;}case 4:{float grain=noise(p*280);a=.91f+.14f*fbm(p*5)+.055f*grain;if(grain<.22f)a*=.75f;break;}case 5:a=.90f+.055f*std::sin(p.x*450)*std::sin(p.z*450)+.10f*fbm(p*22);break;case 6:a=.67f+.55f*fbm(p*.8f)+.14f*noise(p*8);break;case 7:a=.91f+.09f*fbm(p*2)+.045f*noise(p*320)+.016f*std::cos(p.z*32+2.2f*fbm(p*.55f));break;}return clampv(m.color*a,0,.99f);}
struct Ray {V o,d,inv;Ray(V a,V b):o(a),d(b){inv={1/(std::abs(b.x)<1e-20f?1e-20f:b.x),1/(std::abs(b.y)<1e-20f?1e-20f:b.y),1/(std::abs(b.z)<1e-20f?1e-20f:b.z)};} };
struct Box {V lo=INF,hi=-INF;void add(V p){lo=vmin(lo,p);hi=vmax(hi,p);}void add(Box b){add(b.lo);add(b.hi);}float area()const{V d=hi-lo;return 2*(d.x*d.y+d.y*d.z+d.z*d.x);} bool hit(const Ray&r,float mx,float &near)const{V a=(lo-r.o)*r.inv,b=(hi-r.o)*r.inv;V mn=vmin(a,b),ma=vmax(a,b);near=std::max(0.f,std::max(mn.x,std::max(mn.y,mn.z)));float far=std::min(mx,std::min(ma.x,std::min(ma.y,ma.z)));return near<=far;}};
struct Prim {int type=0,mat=0,light=-1;V a,b,c,ng,na,nb,nc;float rad=0;bool smooth=false;Box bounds;V center;};
struct Hit {float t=INF;V p,ng,n;int mat=-1,prim=-1;bool front=true;};
struct Node {Box b;int left=0,right=0,start=0,count=0;};
struct Area {V o,u,v,n,Le;float area;};
struct Scene {
 std::vector<Mat>mats;std::vector<Prim>prims;std::vector<int>order;std::vector<Node>nodes;std::vector<Area>lights;
 V camO={0,2,5},target={0,1,0},eh={.4f,.45f,.5f},ez={.1f,.2f,.4f},sunD={0,1,0},sunC=0,fogC=0;
 float fov=40,aperture=0,focus=0,ei=0,sunAngle=.27f,sunCos=1,sunOmega=.0001f,fogD=0;int maxdepth=10;
 int build(int start,int end){int id=int(nodes.size());nodes.emplace_back();Box b,cb;for(int i=start;i<end;i++){b.add(prims[order[i]].bounds);cb.add(prims[order[i]].center);}nodes[id].b=b;int n=end-start;if(n<=4){nodes[id].start=start;nodes[id].count=n;return id;}V ext=cb.hi-cb.lo;int axis=ext.y>ext.x?1:0;if(ext.z>ext[axis])axis=2;int mid=(start+end)/2;
 // Binned SAH partitions reduce traversal cost for large generated scenes.
 constexpr int NB=12;struct Bin{Box b;int n=0;};Bin bins[NB];float e=ext[axis];int split=-1;float best=INF;
 if(e>1e-7f){for(int i=start;i<end;i++){int k=std::min(NB-1,int((prims[order[i]].center[axis]-cb.lo[axis])*NB/e));bins[k].n++;bins[k].b.add(prims[order[i]].bounds);}Box left[NB-1],right[NB-1];int nl[NB-1],nr[NB-1];Box t;int cnt=0;for(int i=0;i<NB-1;i++){if(bins[i].n)t.add(bins[i].b);cnt+=bins[i].n;left[i]=t;nl[i]=cnt;}t=Box();cnt=0;for(int i=NB-1;i>0;i--){if(bins[i].n)t.add(bins[i].b);cnt+=bins[i].n;right[i-1]=t;nr[i-1]=cnt;}for(int i=0;i<NB-1;i++)if(nl[i]&&nr[i]){float cost=nl[i]*left[i].area()+nr[i]*right[i].area();if(cost<best){best=cost;split=i;}}if(split>=0){float pos=cb.lo[axis]+e*(split+1)/NB;auto it=std::partition(order.begin()+start,order.begin()+end,[&](int p){return prims[p].center[axis]<pos;});mid=int(it-order.begin());}}
 if(mid<=start||mid>=end){mid=(start+end)/2;std::nth_element(order.begin()+start,order.begin()+mid,order.begin()+end,[&](int a,int b){return prims[a].center[axis]<prims[b].center[axis];});}int l=build(start,mid),r=build(mid,end);nodes[id].left=l;nodes[id].right=r;return id;}
 void finish(){order.resize(prims.size());std::iota(order.begin(),order.end(),0);nodes.reserve(prims.size()*2);if(!prims.empty())build(0,int(prims.size()));sunD=norm(sunD);sunCos=std::cos(sunAngle*PI/180);sunOmega=2*PI*(1-sunCos);sunOmega=std::max(sunOmega,1e-7f);}
 bool phit(int id,const Ray&r,Hit&h)const{const Prim&p=prims[id];float t;V gn,sn;if(p.type==1){V oc=r.o-p.a;float hb=dot(oc,r.d),cc=dot(oc,oc)-p.rad*p.rad,dis=hb*hb-cc;if(dis<0)return false;float sq=std::sqrt(dis);t=-hb-sq;if(t<1e-5f)t=-hb+sq;if(t<1e-5f||t>=h.t)return false;gn=(r.o+r.d*t-p.a)/p.rad;sn=gn;}else{V pv=cross(r.d,p.c);float det=dot(p.b,pv);if(std::abs(det)<1e-9f)return false;float inv=1/det;V tv=r.o-p.a;float u=dot(tv,pv)*inv;if(u<0||u>1)return false;V q=cross(tv,p.b);float v=dot(r.d,q)*inv;if(v<0||u+v>1)return false;t=dot(p.c,q)*inv;if(t<1e-5f||t>=h.t)return false;gn=p.ng;sn=p.smooth?norm(p.na*(1-u-v)+p.nb*u+p.nc*v):gn;if(dot(sn,gn)<0)sn=-sn;}
 h.t=t;h.p=r.o+r.d*t;h.front=dot(r.d,gn)<0;h.ng=h.front?gn:-gn;h.n=h.front?sn:-sn;if(dot(h.n,-r.d)<.001f)h.n=h.ng;h.mat=p.mat;h.prim=id;return true;}
 bool hit(const Ray&r,Hit&h,bool any=false)const{if(nodes.empty())return false;int stack[128],sp=0;stack[sp++]=0;bool yes=false;while(sp){int ni=stack[--sp];const Node&nd=nodes[ni];float near;if(!nd.b.hit(r,h.t,near))continue;if(nd.count){for(int j=0;j<nd.count;j++)if(phit(order[nd.start+j],r,h)){yes=true;if(any)return true;}}else{float a,b;bool ha=nodes[nd.left].b.hit(r,h.t,a),hb=nodes[nd.right].b.hit(r,h.t,b);if(ha&&hb){if(a<b){stack[sp++]=nd.right;stack[sp++]=nd.left;}else{stack[sp++]=nd.left;stack[sp++]=nd.right;}}else if(ha)stack[sp++]=nd.left;else if(hb)stack[sp++]=nd.right;}}return yes;}
 V env(V d)const{float t=std::pow(clamp(d.y),.55f);return lerp(eh,ez,t)*ei;}
 float lightP()const{return 1.f/(lights.size()+(ei>0?1:0)+(maxc(sunC)>0?1:0));}
};
float Dggx(float nh,float a){float a2=a*a,q=nh*nh*(a2-1)+1;return a2/(PI*q*q);}
float G1(float nv,float a){if(nv<=0)return 0;return 2*nv/(nv+std::sqrt(a*a+(1-a*a)*nv*nv));}
V fres(V f0,float vh){return f0+(V(1)-f0)*pow5(1-clamp(vh));}
struct BSDF {V f=0;float pdf=0;};
BSDF evaluate(const Mat&m,V c,V n,V v,V l){float nv=dot(n,v),nl=dot(n,l);if(nv<=0||nl<=0)return{};if(m.type==0)return{c/PI,nl/PI};V hv=v+l;if(dot(hv,hv)<1e-12)return{};V h=norm(hv);float nh=std::max(0.f,dot(n,h)),vh=std::max(0.f,dot(v,h)),a=std::max(.002f,m.rough*m.rough),D=Dggx(nh,a);V F=fres(m.type==1?c:V(.04f),vh);V spec=F*(D*G1(nv,a)*G1(nl,a)/(4*nv*nl));float ps=D*nh/std::max(4*vh,1e-10f);if(m.type==1)return{spec,ps};return{spec+c*(V(1)-F)/PI,.25f*ps+.75f*nl/PI};}
V sampleBsdf(const Mat&m,V n,V v,RNG&r){if(m.type==0||(m.type==4&&r.u()>.25f))return cosine(n,r);float a=std::max(.002f,m.rough*m.rough),u=std::min(r.u(),.999999f),ct=std::sqrt((1-u)/(1+(a*a-1)*u)),st=std::sqrt(std::max(0.f,1-ct*ct)),phi=2*PI*r.u();V h=Frame(n).world({st*std::cos(phi),st*std::sin(phi),ct});return norm(h*(2*dot(v,h))-v);}
float dielectricF(float cosi,float eta){float st2=eta*eta*(1-cosi*cosi);if(st2>=1)return 1;float ct=std::sqrt(1-st2);float rp=(eta*cosi-ct)/(eta*cosi+ct),rs=(cosi-eta*ct)/(cosi+eta*ct);return .5f*(rp*rp+rs*rs);}
float power(float a,float b){float aa=a*a,bb=b*b;return aa/(aa+bb+1e-30f);}
V offset(V p,V ng,V d){float eps=std::max(2e-5f,2e-5f*maxc({std::abs(p.x),std::abs(p.y),std::abs(p.z)}));return p+ng*(dot(d,ng)>0?eps:-eps);}
V bumpnormal(const Mat&m,V p,V n){if(m.bump==0||m.tex==0)return n;Frame f(n);float eps=.0008f/std::max(m.scale,.01f);float h=heighttex(m,p),dx=(heighttex(m,p+f.x*eps)-h)/eps,dy=(heighttex(m,p+f.y*eps)-h)/eps;V d=(f.x*dx+f.y*dy)*m.bump;float len=length(d);if(len>.35f)d=d*(.35f/len);return norm(n-d);}
V direct(const Scene&s,const Hit&h,const Mat&m,V col,V n,V v,RNG&r){int total=int(s.lights.size())+(s.ei>0?1:0)+(maxc(s.sunC)>0?1:0);if(!total)return V(0);int k=std::min(total-1,int(r.u()*total));float sel=1.f/total,pdf=0,dist=INF;V l,Le;bool sun=false;
 if(k<int(s.lights.size())){auto&a=s.lights[k];V p=a.o+a.u*r.u()+a.v*r.u();V d=p-h.p;dist=length(d);if(dist<1e-5f)return V(0);l=d/dist;float lc=std::abs(dot(a.n,-l));if(lc<1e-7f)return V(0);pdf=sel*dist*dist/(lc*a.area);Le=a.Le;}
 else if(s.ei>0&&k==int(s.lights.size())){l=cosine(n,r);pdf=sel*std::max(0.f,dot(n,l))/PI;Le=s.env(l);}
 else{l=cone(s.sunD,s.sunCos,r);pdf=sel/s.sunOmega;Le=s.sunC/s.sunOmega;sun=true;}
 float nl=dot(n,l);if(nl<=0||dot(h.ng,l)<=0||pdf<1e-20f)return V(0);Hit shadow;shadow.t=dist>=INF*.5f?INF:dist-std::max(.0001f,dist*1e-5f);if(s.hit(Ray(offset(h.p,h.ng,l),l),shadow,true))return V(0);BSDF b=evaluate(m,col,n,v,l);return Le*b.f*(nl*power(pdf,b.pdf)/pdf);}
V trace(const Scene&s,Ray ray,RNG&r){V L=0,beta=1,prevP=0,prevN=0;bool spec=true;float prevPdf=0;int medium=-1;float firstDistance=INF;
 for(int depth=0;depth<s.maxdepth;depth++){
  Hit h;if(!s.hit(ray,h)){
   V e=s.env(ray.d);float ew=1;if(!spec&&s.ei>0)ew=power(prevPdf,s.lightP()*std::max(0.f,dot(prevN,ray.d))/PI);L+=beta*e*ew;
   if(maxc(s.sunC)>0&&dot(ray.d,s.sunD)>=s.sunCos){float w=spec?1:power(prevPdf,s.lightP()/s.sunOmega);L+=beta*(s.sunC/s.sunOmega)*w;}break;
  }
  if(depth==0)firstDistance=h.t;
  if(medium>=0){V c=s.mats[medium].color;beta*=V(std::pow(std::max(c.x,1e-6f),h.t),std::pow(std::max(c.y,1e-6f),h.t),std::pow(std::max(c.z,1e-6f),h.t));}
  const Mat&m=s.mats[h.mat];
  if(m.type==3){float w=1;int li=s.prims[h.prim].light;if(!spec&&li>=0){auto&a=s.lights[li];V d=h.p-prevP;float ds=dot(d,d),lc=std::abs(dot(a.n,-ray.d));float lp=s.lightP()*ds/std::max(lc*a.area,1e-20f);w=power(prevPdf,lp);}L+=beta*m.color*w;break;}
  V n=bumpnormal(m,h.p,h.n),v=-ray.d;
  if(dot(n,v)<=.001f)n=h.n;
  if(m.type==2){float eta=h.front?1/m.ior:m.ior,ci=clamp(dot(n,v));float F=dielectricF(ci,eta);V d;
   if(r.u()<F){d=norm(ray.d+n*(2*ci));if(dot(d,h.ng)<=0)d=norm(ray.d+h.ng*(2*dot(h.ng,v)));}
   else{float st2=eta*eta*(1-ci*ci);d=norm(ray.d*eta+n*(eta*ci-std::sqrt(std::max(0.f,1-st2))));if(dot(d,h.ng)>=0){ci=clamp(dot(h.ng,v));st2=eta*eta*(1-ci*ci);if(st2>=1){d=norm(ray.d+h.ng*(2*ci));ray=Ray(offset(h.p,h.ng,d),d);spec=true;prevPdf=0;continue;}d=norm(ray.d*eta+h.ng*(eta*ci-std::sqrt(1-st2)));}beta*=eta*eta;medium=h.front?h.mat:-1;}
   ray=Ray(offset(h.p,h.ng,d),d);spec=true;prevPdf=0;
  }else{
   V col=albedo(m,h.p);L+=beta*direct(s,h,m,col,n,v,r);V d=sampleBsdf(m,n,v,r);float nl=dot(n,d);if(nl<=0||dot(h.ng,d)<=0)break;BSDF b=evaluate(m,col,n,v,d);if(b.pdf<=1e-15f)break;beta*=b.f*(nl/b.pdf);prevPdf=b.pdf;prevP=h.p;prevN=n;spec=false;ray=Ray(offset(h.p,h.ng,d),d);
  }
  if(depth>=4){float p=clamp(maxc(beta),.05f,.95f);if(r.u()>p)break;beta*=1/p;}
  if(!std::isfinite(maxc(beta)))break;
 }
 if(s.fogD>0&&firstDistance<INF){float tr=std::exp(-s.fogD*firstDistance);L=L*tr+s.fogC*(1-tr);}return {std::max(0.f,L.x),std::max(0.f,L.y),std::max(0.f,L.z)};
}
void addtri(Scene&s,int m,V a,V b,V c,V na={},V nb={},V nc={},bool smooth=false,int light=-1){V ng=cross(b-a,c-a);if(length(ng)<1e-12f)return;Prim p;p.mat=m;p.a=a;p.b=b-a;p.c=c-a;p.ng=norm(ng);p.na=na;p.nb=nb;p.nc=nc;p.smooth=smooth;p.light=light;p.bounds.add(a);p.bounds.add(b);p.bounds.add(c);p.bounds.lo=p.bounds.lo-V(1e-5f);p.bounds.hi=p.bounds.hi+V(1e-5f);p.center=(a+b+c)/3;s.prims.push_back(p);}
Scene readScene(std::string file){std::ifstream f(file);if(!f)throw std::runtime_error("Cannot open scene: "+file);Scene s;std::unordered_map<std::string,int> mi;std::string line;int ln=0;while(std::getline(f,line)){ln++;line=line.substr(0,line.find('#'));std::istringstream in(line);std::string cmd,name;if(!(in>>cmd))continue;
 if(cmd=="camera")in>>s.camO>>s.target>>s.fov>>s.aperture>>s.focus;
 else if(cmd=="env")in>>s.eh>>s.ez>>s.ei;
 else if(cmd=="sun")in>>s.sunD>>s.sunC>>s.sunAngle;
 else if(cmd=="fog")in>>s.fogD>>s.fogC;
 else if(cmd=="mat"){Mat m;in>>m.name>>m.type>>m.color>>m.rough>>m.ior>>m.tex>>m.scale>>m.bump;mi[m.name]=int(s.mats.size());s.mats.push_back(m);}
 else{in>>name;if(!mi.count(name))throw std::runtime_error("Unknown material line "+std::to_string(ln)+": "+name);int id=mi[name];if(cmd=="sphere"){Prim p;p.type=1;p.mat=id;in>>p.a>>p.rad;p.center=p.a;p.bounds.add(p.a-V(p.rad));p.bounds.add(p.a+V(p.rad));s.prims.push_back(p);}else if(cmd=="tri"||cmd=="trin"){V a,b,c,na,nb,nc;in>>a>>b>>c;if(cmd=="trin")in>>na>>nb>>nc;addtri(s,id,a,b,c,na,nb,nc,cmd=="trin");}else if(cmd=="quad"){V o,u,v;in>>o>>u>>v;int li=-1;if(s.mats[id].type==3){li=int(s.lights.size());s.lights.push_back({o,u,v,norm(cross(u,v)),s.mats[id].color,length(cross(u,v))});}addtri(s,id,o,o+u,o+u+v,{},{},{},false,li);addtri(s,id,o,o+u+v,o+v,{},{},{},false,li);}else throw std::runtime_error("Unknown command line "+std::to_string(ln)+": "+cmd);}
 if(in.fail())throw std::runtime_error("Malformed scene line "+std::to_string(ln)+": "+line);
 }s.finish();return s;}
void pfm(std::string file,const std::vector<V>&data,int w,int h){std::ofstream out(file,std::ios::binary);if(!out)throw std::runtime_error("Cannot write "+file);out<<"PF\n"<<w<<" "<<h<<"\n-1.0\n";for(int y=h-1;y>=0;y--)out.write(reinterpret_cast<const char*>(&data[y*w]),w*sizeof(V));}
int main(int argc,char**argv){try{if(argc<7){std::cerr<<"Usage: crf_render scene.txt output_prefix WIDTH HEIGHT SPP SEED [MAX_DEPTH] [THREADS]\n";return 1;}std::string file=argv[1],prefix=argv[2];int w=std::stoi(argv[3]),h=std::stoi(argv[4]),spp=std::stoi(argv[5]);uint64_t seed=std::stoull(argv[6]);int maxdepth=argc>7?std::stoi(argv[7]):10,threads=argc>8?std::stoi(argv[8]):omp_get_max_threads();if(w<1||h<1||spp<1||maxdepth<1)throw std::runtime_error("Positive sizes, spp, depth required");omp_set_num_threads(threads);auto start=std::chrono::steady_clock::now();Scene s=readScene(file);s.maxdepth=maxdepth;std::cerr<<"Scene: "<<s.prims.size()<<" primitives, "<<s.nodes.size()<<" BVH nodes, "<<s.mats.size()<<" materials, "<<s.lights.size()<<" area lights\n";std::cerr<<"Rendering "<<w<<"x"<<h<<", "<<spp<<" spp, depth "<<maxdepth<<", "<<threads<<" threads\n";
 std::vector<V>image(w*h),alb(w*h),nor(w*h),dep(w*h);V fw=norm(s.target-s.camO),right=norm(cross(fw,V(0,1,0))),up=cross(right,fw);float hh=std::tan(s.fov*PI/360),hw=hh*float(w)/h,focus=s.focus>0?s.focus:length(s.target-s.camO);std::atomic<int>done(0),pct(0);std::atomic<uint64_t>invalidSamples(0);
 #pragma omp parallel for schedule(dynamic,1)
 for(int y=0;y<h;y++){for(int x=0;x<w;x++){int idx=y*w+x;RNG rng(seed^(uint64_t(idx)*0xd1b54a32d192ed03ull));V centerD=norm(fw+right*((2*(x+.5f)/w-1)*hw)+up*((1-2*(y+.5f)/h)*hh));Hit ah;if(s.hit(Ray(s.camO,centerD),ah)){const Mat&m=s.mats[ah.mat];alb[idx]=m.type==2?m.color:albedo(m,ah.p);nor[idx]=ah.n*.5f+V(.5f);dep[idx]=V(ah.t);}V sum=0;
 for(int j=0;j<spp;j++){float px=(2*(x+rng.u())/w-1)*hw,py=(1-2*(y+rng.u())/h)*hh;V d=norm(fw+right*px+up*py),o=s.camO;if(s.aperture>0){float rr=s.aperture*std::sqrt(rng.u()),ang=2*PI*rng.u();V shift=right*(rr*std::cos(ang))+up*(rr*std::sin(ang));V point=s.camO+d*(focus/dot(d,fw));o+=shift;d=norm(point-o);}V color=trace(s,Ray(o,d),rng);if(std::isfinite(color.x)&&std::isfinite(color.y)&&std::isfinite(color.z))sum+=color;else invalidSamples.fetch_add(1,std::memory_order_relaxed);}image[idx]=sum/float(spp);}
 int d=++done;int p=d*100/h;int old=pct.load();if(p>=old+10&&pct.compare_exchange_strong(old,p)){double sec=std::chrono::duration<double>(std::chrono::steady_clock::now()-start).count();
 #pragma omp critical
 std::cerr<<p<<"% ("<<std::fixed<<std::setprecision(1)<<sec<<" s)\n";
 }}
 pfm(prefix+".pfm",image,w,h);pfm(prefix+"_albedo.pfm",alb,w,h);pfm(prefix+"_normal.pfm",nor,w,h);pfm(prefix+"_depth.pfm",dep,w,h);double sec=std::chrono::duration<double>(std::chrono::steady_clock::now()-start).count();float mx=0;double mean=0;size_t bad=0;for(auto c:image){mx=std::max(mx,maxc(c));mean+=lum(c);if(!std::isfinite(maxc(c)))bad++;}std::ofstream out(prefix+".json");out<<"{\n  \"renderer\": \"CRF original C++17 CPU path tracer\",\n  \"scene\": \""<<file<<"\",\n  \"width\": "<<w<<", \"height\": "<<h<<", \"spp\": "<<spp<<",\n  \"seed\": "<<seed<<", \"max_depth\": "<<maxdepth<<", \"threads\": "<<threads<<",\n  \"primitives\": "<<s.prims.size()<<", \"bvh_nodes\": "<<s.nodes.size()<<", \"materials\": "<<s.mats.size()<<",\n  \"area_lights\": "<<s.lights.size()<<", \"seconds\": "<<std::setprecision(8)<<sec<<",\n  \"camera_paths\": "<<(uint64_t(w)*h*spp)<<", \"mean_luminance\": "<<mean/(w*h)<<", \"max_linear_channel\": "<<mx<<", \"nonfinite_pixels\": "<<bad<<", \"invalid_samples\": "<<invalidSamples.load()<<",\n  \"external_assets\": [], \"neural_models\": [], \"postprocessing_baked_in\": false,\n  \"fog_model\": \""<<(s.fogD>0?"analytic camera-distance blend, not volume transport":"none")<<"\"\n}\n";std::cerr<<"Completed "<<prefix<<" in "<<sec<<" seconds\n";return 0;}catch(std::exception&e){std::cerr<<"Error: "<<e.what()<<"\n";return 2;}}
