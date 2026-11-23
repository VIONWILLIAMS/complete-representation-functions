# 高斯升级的部署准备

本目录是独立准备材料，没有改动旧渲染项目，也没有执行高斯训练、GPU 渲染或压力测试。研究路线、数据要求与验收标准见交付包根目录的 `CRF_Gaussian_World_v0.2_Research.md`。默认输入是程序生成场景；照片重建是有明确输入条件的另一条路线。

## 本包实际包含什么

- `tools/gpu_preflight.py`：只读设备检查，已在本机执行。
- `tools/prepare_fixture.py`：程序标定夹具生成器，已执行并做解析相机验证。
- `fixtures/procedural_v1/`：120 个相机、3 组灯光、360 个 CRF 场景文本，以及相机、任务、来源和校验记录；没有渲染图或训练权重。
- `config/experiment_plan.json`：待执行的对照实验、资源预算、V/L/VL 数据划分。
- `config/scene_contract.v0.2.json`：接口设计文档，不冒充完整 JSON Schema 或已实现的新场景引擎。
- `validation/`：真实本机检查记录；不包含 GPU 训练或画质验收。

本包不含 gsplat、NHT 或混合光线追踪训练器，相关模块是报告明确列出的后续实施项。第三方研究代码及模型权重未打包。

## 重新生成标定夹具

在本目录执行，输出到新目录：

```bash
python3 tools/prepare_fixture.py --output fixtures/procedural_reproduction
```

默认夹具含 matte、metal、glass 三个球、地面和面积光，世界单位为米、Y 向上，针孔相机规格为 1024×768。三种高度各 40 个方位，每组灯光共享 96 train、12 val、12 test 的连续方位块留出划分。该程序只生成数据与场景定义，不调用渲染器。

各灯光的场景均已提供，但不代表可全部作为训练数据：固定光照基线只用 `neutral_top`。研究换灯时按 `config/experiment_plan.json`，将 `warm_left` 作为验证、`cool_right` 作为测试，并严格分开 V、L、VL。单一训练照明加已知程序材料是受控实验条件，不是任意照片的可辨识性保证。

渲染任务中的相机内参和旧 AOV 语义见夹具 `metadata.json`；尤其注意像素中心、t 与 Z 深度、法线坐标和类型相关的 albedo。实际接入 gsplat 时必须确认半像素约定，不能不加检查就直接使用 K。

## 只读 GPU 环境报告

`tools/gpu_preflight.py` 只依赖 Python 标准库。它读取 OS/Python 信息、指定文件系统的容量、`nvidia-smi` 的设备名/显存/驱动/计算能力，以及 PATH 中的 `nvcc --version`。计算能力字段不被旧版 `nvidia-smi` 支持时，会退回基础字段查询。

它不会安装软件、修改驱动或设备设置、训练模型、加载模型权重或执行压力测试。它不收集环境变量、凭据、主机名或机器/GPU UUID，也不把外部命令的任意 stdout/stderr 直接复制到报告。唯一写入是指定的 JSON 报告及原子替换所需的临时文件。

在本目录运行：

```bash
python3 tools/gpu_preflight.py --help
python3 tools/gpu_preflight.py --output validation/gpu_preflight.json
```

如果需要检查已有 PyTorch 是否可导入、是否能查询 CUDA 设备，启用独立子进程探测；超时会明确记录：

```bash
python3 tools/gpu_preflight.py \
  --torch --torch-timeout 20 \
  --output validation/gpu_preflight_with_torch.json
```

也可指定准备存放数据的现有目录，查询该文件系统可用空间：

```bash
python3 tools/gpu_preflight.py \
  --disk-path /path/to/data \
  --output validation/gpu_preflight.json
```

`--timeout` 控制每次外部命令，默认 10 秒；`--torch-timeout` 默认 20 秒。报告写入同目录临时文件，完成后用原子替换更新目标 JSON。

## 正确理解状态

| 状态 | 含义 |
| --- | --- |
| `gpu_not_detected` | 当前进程/容器没有检测到可用 NVIDIA GPU；不能据此判断物理宿主机一定没有 GPU |
| `gpu_detected_unvalidated` | 查询到了设备；没有执行训练、梯度、图像正确性或性能测试 |
| `gpu_probe_inconclusive` | 查询失败、超时或环境信息不足，需要按报告排查 |

所有状态的 `training_validated` 和 `performance_measured` 均为 `false`。程序退出码 0 只表示成功写出报告。编译器不在 PATH 不代表工作区中不存在独立编译器；以前自研渲染器的交叉编译结果也不能替代 gsplat 的设备运行验证。

GPU 到位后，先看报告里的实际型号、可见容量和版本，再选择匹配且固定的 PyTorch/CUDA/gsplat 环境，随后执行研究笔记 G0 的小规模前向、反向和保存恢复测试。当前工具不会替用户启动那些步骤。

## 本机验证

本机实际执行记录及结果位于 `validation/preflight_validation.json`。对应设备报告为 `validation/local_preflight.json`。该记录只验证帮助与环境采集工作流，不能用作 GPU 训练或性能证据。
