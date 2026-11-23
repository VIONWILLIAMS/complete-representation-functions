# CUDA 后端：本机交叉编译通过，待目标 GPU 验证

## 当前状态

**本轮已在无 GPU 主机上使用 NVIDIA NVCC 13.0.88 对 `sm_120` 完成真实交叉编译和链接。GPU 尚未执行，CPU/GPU 数值对照与性能未验证，远端 CUDA 12.8 环境也未验证。当前交付图片全部来自 CPU。**

编译环境为 GCC 14.2、glibc 2.41；独立的官方 CUDA 13.0.1 组件提供 NVCC 13.0.88，组件 SHA-256 已与官方再分发清单一致核验。源文件没有修改，完整编译与链接退出码为 0，用时 86.62 秒。本机编译产物只用于编译检查，没有在 GPU 上运行或部署到远端。状态、源码哈希、官方包来源与完整日志见 `logs/cuda_compile_status.json`。

首轮 NVCC 12.8.93 在本机 glibc 2.41 上遇到 `cospi/sinpi/cospif/sinpif` 异常声明不一致；该记录仅描述此本机组合。13.0 工具链消除了这项冲突，随后通过独立目录内的 `lib64 → lib` 链接解决压缩包库目录布局问题，完成链接。没有修改系统头文件、NVIDIA 头文件或 CPU 渲染源码。目标 GPU 机器必须使用当地兼容的工具链重新编译，不能将本机 13 的结果当作远端 12.8 验证。

本机 `ptxas` 对主渲染 kernel 报告 80 个寄存器、512 字节栈帧和 0 字节寄存器溢出。这是编译器静态信息，不是 GPU 利用率或渲染速度。尚有默认构造函数注解被忽略和未使用变量的编译警告，原始日志完整保留。

本后端是 CUDA **软件 BVH 路径追踪器**，不调用 OptiX，也不使用 RT Core。它把已验证 CPU 版本中的几何求交、材质、程序纹理、MIS、折射与吸收公式机械生成到 `cuda_shared.generated.cuh`，用 GPU 指针数组替换 CPU 容器。这样可减少两套算法独立演化导致的偏差；仍必须执行 GPU 检查。

## 文件

- `src/renderer_cuda.cu`：GPU 数据上传、分批采样 kernel、相机、辅助通道和结果写出。
- `tools/generate_cuda_shared.py`：从 CPU 源码生成共享 GPU 数学；源码锚点改变会报错。
- `build_cuda.sh`：编译，默认使用当前 GPU 的 native architecture；允许 `CRF_CUDA_ARCH=sm_120`。
- `tools/run_gpu_workload.sh`：有限任务，先检查与基准，再顺序渲染四组图；如果存在 desert.py 则可再生成沙丘。
- `tools/verify_cuda.py`：读取真实输出检查 Lambert 能量与 Beer 吸收；不凭文件存在就声称通过。
- `logs/cuda_preparation_status.json`：早期准备阶段记录。
- `logs/cuda_compile_status.json`：本次真实交叉编译结果、环境、源码哈希与日志索引。
- `logs/cuda_nvcc12_8_glibc2_41_failure.log`：12.8 与本机 glibc 组合的原始失败日志。
- `logs/cuda_nvcc13_0_initial_link_failure.log`：13.0 首次链接的库目录错误。
- `logs/cuda_nvcc13_0_sm120_success.log`：13.0 完整编译与链接的成功日志。

## 在目标机器执行

依赖：兼容的 NVIDIA 驱动、CUDA Toolkit（包括 NVCC）、NVCC 支持的 C++ 主机编译器、OpenMP、Python3，以及 numpy / Pillow / scipy。

```bash
# 在解压后的项目目录运行
./build_cuda.sh
./tools/run_gpu_workload.sh --smoke

# 仅在上述检查通过并看过 gpu_preview.png 后运行完整任务
CRF_GPU_SPP=256 ./tools/run_gpu_workload.sh --full
```

如果交叉编译给指定架构：

```bash
CRF_CUDA_ARCH=sm_120 ./build_cuda.sh
```

如果 NVCC 拒绝当前主机编译器，应指定一个 CUDA Toolkit 支持的编译器；脚本不使用“忽略不兼容”的开关。

```bash
CRF_NVCC_CCBIN=/usr/bin/g++-13 ./build_cuda.sh
```

路径仅为示例，必须选择目标机器上真实安装且受支持的编译器。

## 有限工作负载与测量

完整模式默认输出：静物2048×3072、建筑3072×2048、风景3072×2048、产品2048×2560，每图256 spp、12次最大路径深度。图像直接按该尺寸渲染；没有超分辨率。沙丘为可选第五张。

任务先测量64、128、256三个线程块大小在同一低分辨率场景的实际 kernel 时间，选择最快者。每张图分成8 spp一批，以便记录进度与异常；每张设置3600秒运行上限。可以通过以下环境变量调整有限参数：

- `CRF_GPU_SPP`：每像素样本数；默认256。
- `CRF_GPU_DEPTH`：最大路径深度；默认12。
- `CRF_GPU_BATCH`：每次 kernel 的样本数；默认8。
- `CRF_MAX_RENDER_SECONDS`：每张图最长秒数；默认3600。
- `CRF_GPU_INCLUDE_DESERT=0`：跳过第五张沙丘。
- `CRF_CUDA_DEVICE`：CUDA 可见设备索引；默认0。
- `CRF_GPU_TELEMETRY_INDEX`：nvidia-smi 的物理设备索引或UUID；默认0。若设置 CUDA_VISIBLE_DEVICES，应确保此项对应同一张卡。

日志包含实际GPU利用率、显存使用量、功耗、温度、每批耗时、设备名称与驱动、源码与二进制哈希、每张图参数。JSON中的 `predicted_resident_occupancy` 是 CUDA occupancy API 的理论驻留占用估计，**不是实测 GPU 利用率**；后者看 telemetry.csv。

不会修改GPU时钟或功耗，不会人为分配空缓冲占满96GB，也不会启动无限压力测试。当前场景的合理工作集可能远小于96GB；能否充分发挥GPU取决于实测吞吐与软件BVH的性能。后续若软件BVH成为瓶颈，需要再开发并验证OptiX后端。

## 输出与后处理

原始线性 PFM 和 albedo / normal / depth 保留。最终 PNG 使用透明记录的传统AOV引导局部滤波、曝光曲线和sRGB转换；没有神经网络降噪或图像生成。GPU和CPU可能因浮点FMA、数学库和路径分支而产生随机采样差异，不应要求逐位相同。

GPU检查通过仅说明基础能量测试通过；不能直接证明完整积分器无误、在目标机器上达到生产稳定性，或已充分利用某张GPU。
