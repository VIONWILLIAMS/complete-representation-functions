#!/usr/bin/env python3
"""Derive CUDA shading/traversal from the CPU reference without editing it.

The generated file is a build artifact. This generator deliberately fails when
its source anchors change, rather than silently compiling divergent algorithms.
"""
from pathlib import Path
import hashlib,re
root=Path(__file__).resolve().parents[1]
s=(root/'src/renderer.cpp').read_text()
def part(a,b):
 if a not in s or b not in s: raise RuntimeError('CPU source anchors changed; inspect CUDA generator')
 return s[s.index(a):s.index(b,s.index(a))]
a=part('constexpr float PI=', 'std::istream&operator>>')
b=part('struct RNG {','struct Mat {')
matline=part('struct Mat {','float heighttex')
matline=matline.replace('std::string name;','')
c=part('float heighttex','struct Scene {')
methods=part(' bool phit(', 'float Dggx')
# methods ends with the original Scene closing brace; copy only runtime methods.
fields='''
struct SceneView {
 Span<Mat> mats; Span<Prim> prims; Span<int> order; Span<Node> nodes; Span<Area> lights;
 V camO={0,2,5},target={0,1,0},eh={.4f,.45f,.5f},ez={.1f,.2f,.4f},sunD={0,1,0},sunC=0,fogC=0;
 float fov=40,aperture=0,focus=0,ei=0,sunAngle=.27f,sunCos=1,sunOmega=.0001f,fogD=0;int maxdepth=10;
'''
d=part('float Dggx','void addtri')
src=a+b+matline+c+fields+methods+d
src=re.sub(r'\bScene\b','SceneView',src)
# Standard host std:: functions are replaced with CUDA host/device equivalents.
for old,new in [('std::max','gmax'),('std::min','gmin'),('std::sqrt','sqrtf'),('std::sin','sinf'),('std::cos','cosf'),('std::pow','powf'),('std::abs','fabsf'),('std::floor','floorf'),('std::exp','expf'),('std::isfinite','isfinite')]:src=src.replace(old,new)
# Every scalar/vector helper and member function is marked host/device.
pattern=r'\b(V|float|bool|uint32_t|uint64_t|BSDF|void)(\s*&?\s*)(operator(?:\[\]|[+*/=-]+)|[A-Za-z_]\w*)\s*\('
src=re.sub(pattern,lambda m:'HD '+m.group(0),src)
for ctor in ['V()=default','V(float a)','V(float a,float b,float c)','RNG(uint64_t s)','Frame(V n)','Ray(V a,V b)']:
 if ctor not in src:raise RuntimeError('Constructor anchor missing: '+ctor)
 src=src.replace(ctor,'HD '+ctor)
header='''// GENERATED from src/renderer.cpp by tools/generate_cuda_shared.py.
// Do not edit. CPU reference SHA256: SOURCE_HASH
#pragma once
#include <cuda_runtime.h>
#include <cstdint>
#include <cmath>
namespace crfgpu {
#define HD __host__ __device__
template<class T> HD inline T gmax(T a,T b){return a>b?a:b;}
template<class T> HD inline T gmin(T a,T b){return a<b?a:b;}
template<class T> struct Span { T* data=nullptr; int count=0; HD T& operator[](int i) const{return data[i];} HD int size()const{return count;} HD bool empty()const{return count==0;} };
'''.replace('SOURCE_HASH',hashlib.sha256(s.encode()).hexdigest())
path=root/'src/cuda_shared.generated.cuh'
path.write_text(header+src+'\n#undef HD\n} // namespace crfgpu\n')
print(path)
