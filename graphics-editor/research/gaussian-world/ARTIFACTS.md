# 原生图像、HDR 与大文件索引

Git 保存源码、配置、参数、失败/成功日志、5 张缩略预览、局部 100% 对照与 mask。原始大图/HDR 已在本会话另行交付，以下链接使用用户既有访问权限；它们不是公开下载链接，Codex 不会仅凭该索引自动获得访问。需要做原图重放时，由用户提供这些已有制品到授权计算环境，或按冻结源码重新渲染，再核对 SHA。

## 已交付的原始包

| 文件 | bytes | SHA-256 |
| --- | ---: | --- |
| [CRF_CodeNative_HD_Collection.zip](https://chatgpt.com/library?file_id=libfile_fde3_f-82b3be7eb4d88191a1ed1d63769d7ce4_e353a1bdd4ac8191b401855ce72d6ecf&account_id=personal) | 50,496,360 | `7a7b75415d9591cb5a0e6a5cd9a7036fce7818ff92ee369ee9d2cbbdbe40dacd` |
| [CRF_01_Warm_Still_Life_HDR_AOV.zip](https://chatgpt.com/library?file_id=libfile_fde3_f-9e4b702dabe48191824aa1599cd2799f_e353a1bdd4ac8191b401855ce72d6ecf&account_id=personal) | 186,886,517 | `2b0881a011f97d3791ccb4085260fb79d01252faaa8590db7e9b2562af01c4a7` |
| [CRF_02_Sunlit_Interior_HDR_AOV.zip](https://chatgpt.com/library?file_id=libfile_fde3_f-7930062c5e948191aa3e46cd94c40fa4_e353a1bdd4ac8191b401855ce72d6ecf&account_id=personal) | 214,337,085 | `8ae6908d306bca04859cbb8641d84fe5b11d24d5c2a7be9634ada4e1702a4e9c` |
| [CRF_03_Atelier_Product_HDR_AOV.zip](https://chatgpt.com/library?file_id=libfile_fde3_f-f648e4c879ac81918613acee776c4f83_e353a1bdd4ac8191b401855ce72d6ecf&account_id=personal) | 192,408,677 | `41312b2b10aa91606539d474457a234fc03cf9f215f21589f383e53450b4c5b9` |
| [CRF_04_Alpine_Lake_HDR_AOV.zip](https://chatgpt.com/library?file_id=libfile_fde3_f-a24c3cd077e48191ae6238d3faec1f69_e353a1bdd4ac8191b401855ce72d6ecf&account_id=personal) | 195,220,306 | `aa1a76fbefe6b6233a5fa28733b5f68f90b3c3bb7ef7da0dccfe78246a38e06f` |
| [CRF_05_Wind_Dunes_HDR_AOV.zip](https://chatgpt.com/library?file_id=libfile_fde3_f-4b473e1b45c48191a35900f9d81271ba_e353a1bdd4ac8191b401855ce72d6ecf&account_id=personal) | 361,494,087 | `d8c9153cc6b71cc686b22e9fcd8b38c6582fa1a348e29a0283fea891a3554004` |

高清包含 5 张原生 PNG 与离线画廊；5 个 HDR 包分别包含未滤波线性数据与 AOV。包内部的逐文件摘要见 `crf_render/outputs/collection_manifest.json`，包级摘要见 `records/EXTERNAL_ARTIFACTS.json`。显影中的有偏处理见 WORK_LOG 和 audit。

## 可重建的展开场景

`records/EXTERNAL_ARTIFACTS.json` 另保留 7 个展开 `.scene` 的原始大小与 SHA（合计约 84 MB）。其 Python 生成器已经入 Git；运行于新目录，核对场景摘要再渲染。产品首张图片采用早期版本，因此 `crf_render/run_sources/product/product.scene` 作为冻结例外直接收录。

`scenes/control_product_A.scene` 与 B 可以由已有受控参数对照脚本生成；该脚本会运行渲染，应在独立副本按有限预算执行。五题材生成器的调用方式见 `crf_render/README.md`。静物和室内还依赖 `scenes/arch_helpers.py`，不要只复制各自 `run_sources/` 子目录。

## 预览用途

- `crf_render/outputs/CRF_0*_preview.jpg`：浏览构图与题材，不代替原尺寸细节。
- `crf_render/delivery/CRF_Collection_Contact_Sheet.jpg`：5 图联系表。
- `crf_render/audit/*/*comparison_100pct.jpg`：当时显示滤波的局部对照。
- `crf_render/audit/*/*changed_mask.png`：显示处理像素位置。
- `crf_render/outputs/CRF_Controlled_Parameter_Change.png`：玻璃参数改变的有限对照。

没有将构建二进制、CUDA 安装工具链、虚拟环境、缓存、凭据、上传回执或临时签名 URL 放入 Git。Notebook 内嵌的是历史源码快照，GPU 单元格未执行；开发时优先使用当前分支源码，避免无意解包覆盖。
