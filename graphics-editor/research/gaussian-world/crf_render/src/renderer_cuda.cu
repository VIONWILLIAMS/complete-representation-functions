// CRF CUDA prototype. Uses the SAME generated shading and BVH traversal as CPU.
// Status at authoring: source prepared; no CUDA compiler/GPU available locally.
// No claim of compilation, performance, RT-core use, or image equivalence is made.
#define main crf_reference_cli
#include "renderer.cpp"
#undef main
#include "cuda_shared.generated.cuh"
#include <type_traits>
#include <cstdlib>
namespace cg=crfgpu;
#define CUDA_OK(expr) do {cudaError_t e=(expr);if(e!=cudaSuccess)throw std::runtime_error(std::string(#expr)+": "+cudaGetErrorString(e));} while(0)
static_assert(sizeof(V)==sizeof(cg::V),"vector ABI mismatch");
static_assert(sizeof(Prim)==sizeof(cg::Prim),"primitive ABI mismatch");
static_assert(sizeof(Node)==sizeof(cg::Node),"BVH ABI mismatch");
static_assert(sizeof(Area)==sizeof(cg::Area),"area ABI mismatch");
static_assert(std::is_trivially_copyable<Prim>::value && std::is_trivially_copyable<cg::Prim>::value,"POD primitives required");
struct DeviceMemory {
 std::vector<void*> allocations;size_t bytes=0;
 template<class T>T* alloc(size_t n){if(!n)return nullptr;T*p=nullptr;CUDA_OK(cudaMalloc(reinterpret_cast<void**>(&p),sizeof(T)*n));allocations.push_back(p);bytes+=sizeof(T)*n;return p;}
 template<class D,class S>cg::Span<D> upload(const std::vector<S>&v){static_assert(sizeof(D)==sizeof(S),"upload ABI");D*p=alloc<D>(v.size());if(!v.empty())CUDA_OK(cudaMemcpy(p,v.data(),sizeof(D)*v.size(),cudaMemcpyHostToDevice));return {p,int(v.size())};}
 ~DeviceMemory(){for(auto p:allocations)cudaFree(p);}
};
cg::V cv(V a){return{a.x,a.y,a.z};}
cg::SceneView uploadScene(Scene&s,DeviceMemory&m){cg::SceneView d;std::vector<cg::Mat> mats;for(auto&a:s.mats){cg::Mat b;b.type=a.type;b.tex=a.tex;b.color=cv(a.color);b.rough=a.rough;b.ior=a.ior;b.scale=a.scale;b.bump=a.bump;mats.push_back(b);}d.mats=m.upload<cg::Mat>(mats);d.prims=m.upload<cg::Prim>(s.prims);d.order=m.upload<int>(s.order);d.nodes=m.upload<cg::Node>(s.nodes);d.lights=m.upload<cg::Area>(s.lights);
 d.camO=cv(s.camO);d.target=cv(s.target);d.eh=cv(s.eh);d.ez=cv(s.ez);d.sunD=cv(s.sunD);d.sunC=cv(s.sunC);d.fogC=cv(s.fogC);d.fov=s.fov;d.aperture=s.aperture;d.focus=s.focus;d.ei=s.ei;d.sunAngle=s.sunAngle;d.sunCos=s.sunCos;d.sunOmega=s.sunOmega;d.fogD=s.fogD;d.maxdepth=s.maxdepth;return d;}
struct CameraGPU {cg::V fw,right,up;float hh,hw,focus;};
__global__ void initializeKernel(cg::SceneView s,CameraGPU c,int w,int h,uint64_t seed,cg::V*sum,cg::V*alb,cg::V*nor,cg::V*dep,uint64_t*state){
 size_t i=size_t(blockIdx.x)*blockDim.x+threadIdx.x;if(i>=size_t(w)*h)return;int x=int(i%w),y=int(i/w);cg::RNG r(seed^(uint64_t(i)*0xd1b54a32d192ed03ull));state[i]=r.state;sum[i]=cg::V(0);alb[i]=cg::V(0);nor[i]=cg::V(0);dep[i]=cg::V(0);
 cg::V d=cg::norm(c.fw+c.right*((2*(x+.5f)/w-1)*c.hw)+c.up*((1-2*(y+.5f)/h)*c.hh));cg::Hit hit;if(s.hit(cg::Ray(s.camO,d),hit)){auto&m=s.mats[hit.mat];alb[i]=m.type==2?m.color:cg::albedo(m,hit.p);nor[i]=hit.n*.5f+cg::V(.5f);dep[i]=cg::V(hit.t);}
}
__global__ void renderBatchKernel(cg::SceneView s,CameraGPU c,int w,int h,int count,cg::V*sum,uint64_t*state,unsigned long long*invalid){
 size_t i=size_t(blockIdx.x)*blockDim.x+threadIdx.x;if(i>=size_t(w)*h)return;int x=int(i%w),y=int(i/w);cg::RNG r(0);r.state=state[i];cg::V accum=sum[i];
 for(int j=0;j<count;j++){float px=(2*(x+r.u())/w-1)*c.hw,py=(1-2*(y+r.u())/h)*c.hh;cg::V d=cg::norm(c.fw+c.right*px+c.up*py),o=s.camO;if(s.aperture>0){float rr=s.aperture*sqrtf(r.u()),ang=2*cg::PI*r.u();cg::V shift=c.right*(rr*cosf(ang))+c.up*(rr*sinf(ang));cg::V point=s.camO+d*(c.focus/cg::dot(d,c.fw));o+=shift;d=cg::norm(point-o);}cg::V color=cg::trace(s,cg::Ray(o,d),r);if(isfinite(color.x)&&isfinite(color.y)&&isfinite(color.z))accum+=color;else atomicAdd(invalid,1ull);}
 sum[i]=accum;state[i]=r.state;
}
__global__ void normalizeKernel(cg::V*image,size_t n,float invspp){size_t i=size_t(blockIdx.x)*blockDim.x+threadIdx.x;if(i<n)image[i]*=invspp;}
void downloadPFM(const std::string&file,cg::V*d,int w,int h){std::vector<V>v(size_t(w)*h);CUDA_OK(cudaMemcpy(v.data(),d,sizeof(V)*v.size(),cudaMemcpyDeviceToHost));pfm(file,v,w,h);}
int envInt(const char*name,int fallback){const char*p=std::getenv(name);return p?std::stoi(p):fallback;}
int main(int argc,char**argv){try{
 if(argc<7){std::cerr<<"Usage: crf_render_cuda scene prefix WIDTH HEIGHT SPP SEED [DEPTH=10] [SAMPLES_PER_BATCH=8]\nEnvironment: CRF_CUDA_DEVICE=0 CRF_CUDA_BLOCK=128\n";return 1;}
 std::string file=argv[1],prefix=argv[2];int w=std::stoi(argv[3]),h=std::stoi(argv[4]),spp=std::stoi(argv[5]);uint64_t seed=std::stoull(argv[6]);int depth=argc>7?std::stoi(argv[7]):10,batch=argc>8?std::stoi(argv[8]):8,block=envInt("CRF_CUDA_BLOCK",128),device=envInt("CRF_CUDA_DEVICE",0);if(w<=0||h<=0||spp<=0||batch<=0||depth<=0||block<32||block>512||block%32)throw std::runtime_error("Invalid dimensions/sample counts or block size");
 auto begin=std::chrono::steady_clock::now();CUDA_OK(cudaSetDevice(device));cudaDeviceProp prop;CUDA_OK(cudaGetDeviceProperties(&prop,device));CUDA_OK(cudaDeviceSetLimit(cudaLimitStackSize,8192));size_t free0,total;CUDA_OK(cudaMemGetInfo(&free0,&total));std::cerr<<"Device: "<<prop.name<<", SM "<<prop.major<<prop.minor<<", free "<<free0/(1024.*1024.)<<" MiB\n";
 Scene host=readScene(file);host.maxdepth=depth;DeviceMemory mem;cg::SceneView s=uploadScene(host,mem);size_t n=size_t(w)*h;if(n>size_t(std::numeric_limits<int>::max()))throw std::runtime_error("Image exceeds this prototype's indexing bound");size_t bufferEstimate=n*(4*sizeof(cg::V)+sizeof(uint64_t));if(bufferEstimate>free0*0.80)throw std::runtime_error("Film buffers exceed80% of free GPU memory; use smaller dimensions");auto sum=mem.alloc<cg::V>(n),alb=mem.alloc<cg::V>(n),nor=mem.alloc<cg::V>(n),dep=mem.alloc<cg::V>(n);auto states=mem.alloc<uint64_t>(n);auto invalid=mem.alloc<unsigned long long>(1);CUDA_OK(cudaMemset(invalid,0,sizeof(unsigned long long)));
 CameraGPU c;c.fw=cg::norm(s.target-s.camO);c.right=cg::norm(cg::cross(c.fw,cg::V(0,1,0)));c.up=cg::cross(c.right,c.fw);c.hh=std::tan(s.fov*cg::PI/360);c.hw=c.hh*float(w)/h;c.focus=s.focus>0?s.focus:cg::length(s.target-s.camO);int grid=int((n+block-1)/block);
 initializeKernel<<<grid,block>>>(s,c,w,h,seed,sum,alb,nor,dep,states);CUDA_OK(cudaGetLastError());CUDA_OK(cudaDeviceSynchronize());cudaEvent_t ev0,ev1;CUDA_OK(cudaEventCreate(&ev0));CUDA_OK(cudaEventCreate(&ev1));float kernelMs=0;int smblocks=0;CUDA_OK(cudaOccupancyMaxActiveBlocksPerMultiprocessor(&smblocks,renderBatchKernel,block,0));float theoreticalOccupancy=float(smblocks*block)/prop.maxThreadsPerMultiProcessor;std::cerr<<"Primitives "<<host.prims.size()<<", allocation "<<mem.bytes/(1024.*1024.)<<" MiB, predicted resident occupancy "<<theoreticalOccupancy*100<<"% (not measured GPU utilization)\n";
 for(int done=0;done<spp;){int count=std::min(batch,spp-done);CUDA_OK(cudaEventRecord(ev0));renderBatchKernel<<<grid,block>>>(s,c,w,h,count,sum,states,invalid);CUDA_OK(cudaGetLastError());CUDA_OK(cudaEventRecord(ev1));CUDA_OK(cudaEventSynchronize(ev1));float ms;CUDA_OK(cudaEventElapsedTime(&ms,ev0,ev1));kernelMs+=ms;done+=count;std::cerr<<done<<"/"<<spp<<" spp, batch "<<ms/1000<<" s\n";}
 normalizeKernel<<<grid,block>>>(sum,n,1.f/spp);CUDA_OK(cudaGetLastError());CUDA_OK(cudaDeviceSynchronize());downloadPFM(prefix+".pfm",sum,w,h);downloadPFM(prefix+"_albedo.pfm",alb,w,h);downloadPFM(prefix+"_normal.pfm",nor,w,h);downloadPFM(prefix+"_depth.pfm",dep,w,h);unsigned long long bad;CUDA_OK(cudaMemcpy(&bad,invalid,sizeof(bad),cudaMemcpyDeviceToHost));cudaEventDestroy(ev0);cudaEventDestroy(ev1);size_t free1;CUDA_OK(cudaMemGetInfo(&free1,&total));double seconds=std::chrono::duration<double>(std::chrono::steady_clock::now()-begin).count();
 std::ofstream out(prefix+".json");out<<"{\n  \"renderer\": \"CRF CUDA software-BVH prototype\",\n  \"gpu_name\": \""<<prop.name<<"\", \"compute_capability\": \""<<prop.major<<"."<<prop.minor<<"\",\n  \"scene\": \""<<file<<"\", \"width\": "<<w<<", \"height\": "<<h<<", \"spp\": "<<spp<<",\n  \"seed\": "<<seed<<", \"max_depth\": "<<depth<<", \"samples_per_batch\": "<<batch<<", \"block_size\": "<<block<<",\n  \"primitives\": "<<host.prims.size()<<", \"bvh_nodes\": "<<host.nodes.size()<<", \"materials\": "<<host.mats.size()<<",\n  \"allocated_device_bytes\": "<<mem.bytes<<", \"device_memory_total_bytes\": "<<total<<", \"device_memory_used_after_bytes\": "<<total-free1<<",\n  \"predicted_resident_occupancy\": "<<theoreticalOccupancy<<", \"kernel_seconds\": "<<kernelMs/1000<<", \"seconds\": "<<seconds<<",\n  \"camera_paths\": "<<n*spp<<", \"invalid_samples\": "<<bad<<",\n  \"hardware_rt_cores_used\": false, \"external_assets\": [], \"neural_models\": [], \"postprocessing_baked_in\": false\n}\n";std::cerr<<"Finished in "<<seconds<<" s. Actual utilization/power require nvidia-smi telemetry.\n";return bad?3:0;
 }catch(std::exception&e){std::cerr<<"CUDA renderer error: "<<e.what()<<"\n";return 2;}}
