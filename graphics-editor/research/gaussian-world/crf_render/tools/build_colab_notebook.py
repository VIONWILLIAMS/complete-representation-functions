#!/usr/bin/env python3
"""Build a portable, source-embedded Colab GPU handoff notebook.

This builder does not contact Colab, authenticate, allocate a runtime, install
dependencies, or execute CUDA. Re-run it after refreshing the source ZIP.
Requires nbformat locally; the resulting notebook uses standard Colab packages.
"""
from __future__ import annotations
import argparse
import ast
import base64
from datetime import datetime
import hashlib
import inspect
import json
from pathlib import Path, PurePosixPath
import textwrap
import zipfile
from zoneinfo import ZoneInfo
import nbformat as nbf


ROOT=Path(__file__).resolve().parents[1]
REQUIRED=[
    'build_cuda.sh','requirements.txt','src/renderer.cpp','src/renderer_cuda.cu',
    'tools/generate_cuda_shared.py','tools/run_gpu_workload.sh','tools/verify_cuda.py',
    'tools/develop.py','scenes/common.py','scenes/still_life.py','scenes/architecture.py',
    'scenes/product.py','scenes/landscape.py','scenes/check_lambert.scene','scenes/check_beer.scene',
]


def sha(data):return hashlib.sha256(data).hexdigest()
def md(text):return nbf.v4.new_markdown_cell(inspect.cleandoc(text))
def code(text,**metadata):
    cell=nbf.v4.new_code_cell(inspect.cleandoc(text)+'\n')
    cell.metadata.update(metadata)
    return cell


def inspect_source(path,status):
    data=path.read_bytes()
    with zipfile.ZipFile(path) as z:
        names=set(z.namelist())
        missing=[p for p in REQUIRED if p not in names]
        if missing:raise ValueError('Source ZIP lacks required GPU files: '+', '.join(missing))
        for item in z.infolist():
            p=PurePosixPath(item.filename)
            if p.is_absolute() or '..' in p.parts or '\\' in item.filename or ((item.external_attr>>16)&0o170000)==0o120000:
                raise ValueError('Unsafe source ZIP member: '+item.filename)
        bad=z.testzip()
        if bad:raise ValueError('ZIP CRC check failed: '+bad)
        changed=[p for p in REQUIRED+(['scenes/desert.py'] if 'scenes/desert.py' in names else [])
                 if not (ROOT/p).exists() or sha((ROOT/p).read_bytes())!=sha(z.read(p))]
        if status=='refreshed' and changed:
            raise ValueError('Refresh the source ZIP first; current source differs for: '+', '.join(changed))
        work=z.read('tools/run_gpu_workload.sh').decode('utf-8')
        for token in ('--smoke','--full','gpu_preview.png','check_lambert_cuda','check_beer_cuda','benchmark_summary.json'):
            if token not in work:raise ValueError('Workload contract changed; review notebook generation: '+token)
    return data,changed,'scenes/desert.py' in names,len(names)


def compile_evidence(source):
    """Read recorded compilation evidence and bind it to the embedded sources.

    A successful local NVCC build is distinct from GPU execution and from a
    successful build in the eventual Colab runtime. Never infer either.
    """
    relative='logs/cuda_compile_status.json'
    with zipfile.ZipFile(source) as archive:
        if relative in archive.namelist():
            raw=archive.read(relative);origin='embedded_source_zip'
        elif (ROOT/relative).is_file():
            raw=(ROOT/relative).read_bytes();origin='current_project_record'
        else:
            return {'available':False,'record_path':relative,
                    'cross_compile_matches_embedded_source':False,
                    'gpu_execution_verified':False,
                    'note':'No local compilation status record was available to this builder.'}
        report=json.loads(raw)
        paths={'renderer.cpp':'src/renderer.cpp',
               'renderer_cuda.cu':'src/renderer_cuda.cu',
               'cuda_shared.generated.cuh':'src/cuda_shared.generated.cuh'}
        checks={name:(path in archive.namelist() and
                      sha(archive.read(path))==report.get('source_hashes',{}).get(name))
                for name,path in paths.items()}
    passed=(report.get('cuda_source_compiled') is True and
            report.get('link_succeeded') is True and report.get('compile_exit_code')==0)
    return {'available':True,'record_path':relative,'record_origin':origin,
            'record_sha256':sha(raw),'local_compile_and_link_passed':passed,
            'cross_compile_matches_embedded_source':passed and all(checks.values()),
            'embedded_source_hash_checks':checks,
            'nvcc_version':report.get('nvcc_version'),
            'toolkit_distribution':report.get('toolkit_distribution'),
            'host_compiler':report.get('host_compiler'),
            'host_glibc':report.get('host_glibc'),
            'target':report.get('target'),
            'compile_seconds':report.get('compile_seconds'),
            'local_binary_sha256':report.get('local_binary_sha256'),
            'gpu_execution_verified':report.get('gpu_executed') is True,
            'remote_cuda12_8_validated':report.get('remote_cuda12_8_validated') is True,
            'remote_build_required':report.get('remote_build_required',True),
            'attempts':[{'nvcc':a.get('nvcc'),'exit_code':a.get('exit_code'),
                         'outcome':a.get('outcome'),'log':a.get('log')}
                        for a in report.get('attempts',[])],
            'interpretation':report.get('interpretation')}


def compile_evidence_text(evidence):
    if evidence.get('cross_compile_matches_embedded_source'):
        text=(f"**本机交叉编译与链接已通过：NVCC {evidence['nvcc_version']}，"
              f"目标 `{evidence['target']}`，主机编译器 `{evidence['host_compiler']}`。** "
              "记录中的三份核心源码哈希与本 Notebook 内嵌源码一致。"
              "这证明本机该工具链可以生成并链接程序，不代表远端编译、GPU 执行、性能或画质已验证。")
    elif evidence.get('local_compile_and_link_passed'):
        text=("项目已有本机交叉编译与链接通过的记录，但本 Notebook 内嵌源码的哈希未全部匹配该记录。"
              "因此不把旧编译结果当作这个源码快照的编译验证；请在你的运行时重新编译。")
    else:
        text=("这个源码快照未附有可核对的本机交叉编译通过证据。"
              "接下来的单元格会在你的已有 GPU 运行时编译并记录结果。")
    if any(str(a.get('nvcc','')).startswith('12.8') and a.get('exit_code')!=0
           and 'glibc 2.41' in str(a.get('outcome','')).lower()
           for a in evidence.get('attempts',[])):
        text+=("\n\n本机另一次 CUDA 12.8 尝试因 glibc 2.41 与 CUDA 头文件声明冲突而失败。"
               "该本机环境问题不能推断为远端 CUDA 12.8 必然失败；远端 12.8 仍需在那里实际编译。")
    return text


def build(source,output,status):
    raw,changed,has_desert,entry_count=inspect_source(source,status)
    digest=sha(raw)
    evidence=compile_evidence(source)
    # Preserve cleandoc's indentation when the inserted evidence has paragraphs.
    compile_note=compile_evidence_text(evidence).replace('\n','\n        ')
    snapshot_label='预备版：内嵌此前源码检查点' if status=='preliminary' else '源码包已刷新；远端 GPU 运行仍待实测'
    timestamp=datetime.now(ZoneInfo('Asia/Shanghai')).isoformat(timespec='seconds')
    cells=[
        md(f'''# CRF · 在你的 Colab GPU 上运行代码渲染

        **{snapshot_label}。本 Notebook 的 GPU 单元格尚未执行；远端编译、GPU 执行与画质验证仍待实测。**

        {compile_note}

        目标是在你自己已经选择的 Colab GPU 运行时，编译这份 C++ / CUDA 图形程序，由程序计算图片。
        文件内已经带上源码 ZIP，不需要登录 ChatGPT、复制凭据、挂载 Drive 或下载外部图片资产。

        **使用方法：** 将本 `.ipynb` 上传到 Colab，自己选择 GPU 运行时并连接，按顺序运行。
        默认只执行小规模 `--smoke` 检查；高清五图需在参数单元格明确设置 `RUN_FULL = True`。
        Notebook 不调用任何 VM 分配、保活、重启、关机或账户 API。

        - 源码包：`{source.name}`；{len(raw):,} 字节；{entry_count} 个条目。
        - SHA-256：`{digest}`。
        - 生成时间（北京时间）：{timestamp}。
        - 当前工作目录与此源码检查点不同的关键文件：{', '.join(changed) if changed else '无'}。

        图片输出中出现 `CRF CUDA software-BVH prototype` 且基础数值检查通过，才可说明这次在你的运行时实际执行过 CUDA。
        该后端是软件 BVH 路径追踪原型；这些检查不等于生产级物理正确性或 RT Core / OptiX 性能验证。
        '''),
        md('''## 1 · 参数与已有 GPU 检查

        `RUN_FULL=False` 时只编译并运行有限的小样本检查。保持默认值即可先确认设备、编译器和基本能量计算。
        只有你主动改成 `True`，才会运行原项目的高清场景工作负载。'''),
        code(f'''#@title 参数（完整渲染默认关闭）
        RUN_FULL = False
        FULL_SPP = 128
        FULL_DEPTH = 12
        BATCH_SPP = 8
        INCLUDE_DESERT = {has_desert!r}
        PER_RENDER_SECONDS = 600
        SMOKE_WALL_SECONDS = 600
        FULL_WALL_SECONDS = 2400
        BUILD_WALL_SECONDS = 300
        CUDA_ARCH = "native"
        HOST_CXX = ""  # 仅在 NVCC 报编译器不兼容时，填已有且受支持的编译器绝对路径。
        EXPORT_RAW_PFM = False  # 原始浮点数据较大；默认导出 PNG、日志、度量与源码。
        DOWNLOAD_RESULTS = False  # True 时，最后一步调用 Colab 的标准文件下载。

        assert isinstance(RUN_FULL, bool)
        assert 16 <= FULL_SPP <= 256
        assert 2 <= FULL_DEPTH <= 16
        assert 1 <= BATCH_SPP <= 16
        assert 60 <= PER_RENDER_SECONDS <= 900
        assert 60 <= SMOKE_WALL_SECONDS <= 900
        assert 180 <= FULL_WALL_SECONDS <= 3600
        assert 60 <= BUILD_WALL_SECONDS <= 600
        print("模式:", "通过 smoke 后运行有限高清任务" if RUN_FULL else "仅 smoke 检查")
        '''),
        code('''#@title 查询你已经连接的 GPU；没有 GPU 就停止
        import os, sys, json, hashlib, shutil, subprocess, tempfile, zipfile, io, base64
        from pathlib import Path, PurePosixPath
        from datetime import datetime, timezone

        if not Path('/content').is_dir():
            raise RuntimeError('请在你自己的 Colab notebook 运行时执行此文件。当前环境不是已连接的 Colab /content 环境。')
        gpu_query = shutil.which('nvidia-smi')
        if gpu_query is None:
            raise RuntimeError('当前运行时未提供 nvidia-smi。请在自己的 Colab 设置中选择 GPU 并连接，然后重跑；本 notebook 不会申请或切换 VM。')
        inventory = subprocess.run([gpu_query, '--query-gpu=index,name,driver_version,memory.total', '--format=csv'],
                                   text=True, capture_output=True, timeout=20, check=True).stdout
        print(inventory)
        missing = [name for name in ('nvcc', 'g++', 'timeout') if shutil.which(name) is None]
        if missing:
            raise RuntimeError('已有运行时缺少这些工具：' + ', '.join(missing) + '。请使用含兼容 CUDA Toolkit / 主机编译器的环境；这里不自动安装驱动或申请新 VM。')
        GPU_CHECK_COMPLETE = True
        '''),
        md('''## 2 · 验证并解压内嵌源码

        源码会解压到 `/content` 下新建的独立项目目录，不覆盖你已有的项目。
        解压前核对 SHA-256 与 ZIP 校验，并拒绝路径越界和符号链接条目。'''),
    ]
    archive_literal='\n'.join('    '+repr(chunk) for chunk in textwrap.wrap(base64.b64encode(raw).decode('ascii'),100))
    archive_cell=f'''#@title 内嵌源码检查点（可折叠；不需要修改 Base64）
assert GPU_CHECK_COMPLETE
SOURCE_SHA256 = {digest!r}
SOURCE_SNAPSHOT_STATUS = {status!r}
SOURCE_NAME = {source.name!r}
LOCAL_CUDA_COMPILE_EVIDENCE = {evidence!r}
ARCHIVE_B64 = (\n{archive_literal}\n)
archive_bytes = base64.b64decode(ARCHIVE_B64, validate=True)
assert hashlib.sha256(archive_bytes).hexdigest() == SOURCE_SHA256, '源码包校验失败'
RUN_ROOT = Path(tempfile.mkdtemp(prefix='crf_gpu_', dir='/content'))
PROJECT = RUN_ROOT / 'project'
PROJECT.mkdir()
SOURCE_ZIP = RUN_ROOT / SOURCE_NAME
SOURCE_ZIP.write_bytes(archive_bytes)
with zipfile.ZipFile(io.BytesIO(archive_bytes)) as archive:
    assert archive.testzip() is None, 'ZIP CRC 校验失败'
    for item in archive.infolist():
        relative = PurePosixPath(item.filename)
        if relative.is_absolute() or '..' in relative.parts or '\\\\' in item.filename:
            raise RuntimeError('源码包路径越界')
        if ((item.external_attr >> 16) & 0o170000) == 0o120000:
            raise RuntimeError('源码包包含不允许的符号链接')
        target = (PROJECT / item.filename).resolve()
        assert target.is_relative_to(PROJECT.resolve())
        if item.is_dir():
            target.mkdir(parents=True, exist_ok=True)
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(archive.read(item))
for required in {REQUIRED!r}:
    assert (PROJECT / required).is_file(), '缺少文件: ' + required
LOGS = RUN_ROOT / 'notebook_logs'
LOGS.mkdir()
(LOGS / 'gpu_inventory.csv').write_text(inventory)
SMOKE_DIR = PROJECT / 'outputs' / 'colab_smoke'
FULL_DIR = PROJECT / 'outputs' / 'colab_full'
print('独立项目目录:', PROJECT)
print('源码 SHA-256:', SOURCE_SHA256)
print('接下来在此 Colab 运行时重新编译；本机交叉编译记录不替代这里的 GPU 实测。')
'''
    cells.append(nbf.v4.new_code_cell(archive_cell,metadata={'cellView':'form'}))
    cells += [
        md('''## 3 · 安装项目依赖并编译 CUDA

        只安装源码中列出的 Python 依赖，使用当前 GPU 运行时已有的驱动、NVCC 和主机编译器。
        如果 NVCC 报错，单元格会停止并保留日志；不会绕过编译器兼容性检查。'''),
        code('''#@title 依赖与有限命令执行器
        def run_logged(argv, name, wall_seconds, extra_env=None):
            env = os.environ.copy()
            env.update(extra_env or {})
            bounded = ['timeout', '--signal=TERM', '--kill-after=20', str(wall_seconds)] + list(argv)
            logfile = LOGS / name
            print('运行:', ' '.join(map(str, argv)), '| 上限:', wall_seconds, '秒')
            with logfile.open('w') as log:
                process = subprocess.Popen(bounded, cwd=PROJECT, env=env,
                                           stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                           text=True, bufsize=1)
                for line in process.stdout:
                    log.write(line)
                    print(line, end='')
                rc = process.wait()
            if rc != 0:
                raise RuntimeError(f'命令退出码 {rc}；查看 {logfile}。未启动后续任务。')
            return logfile

        run_logged([sys.executable, '-m', 'pip', 'install', '-r', str(PROJECT/'requirements.txt')],
                   'python_dependencies.log', 240)
        run_env = {'CRF_CUDA_ARCH': CUDA_ARCH}
        if HOST_CXX:
            assert Path(HOST_CXX).is_file(), '指定的主机编译器不存在'
            run_env['CRF_NVCC_CCBIN'] = HOST_CXX
        run_logged(['bash', 'build_cuda.sh'], 'cuda_build.log', BUILD_WALL_SECONDS, run_env)
        assert (PROJECT / 'crf_render_cuda').is_file(), '编译后未发现 CUDA 程序'
        CUDA_BUILD_COMPLETE = True
        '''),
        md('''## 4 · 先运行 smoke，再看真实输出

        原项目脚本会先执行 Lambert 能量与 Beer 吸收数值检查，再以 64 / 128 / 256 三种线程块尺寸运行小图基准。
        `gpu_preview.png` 来自这次 GPU 程序的实际输出。没有通过检查，不进入完整任务。'''),
        code('''#@title 实际 GPU smoke
        assert CUDA_BUILD_COMPLETE
        smoke_env = dict(run_env, CRF_GPU_OUTPUT=str(SMOKE_DIR),
                         CRF_MAX_RENDER_SECONDS=str(PER_RENDER_SECONDS))
        run_logged(['bash', 'tools/run_gpu_workload.sh', '--smoke'], 'gpu_smoke.log', SMOKE_WALL_SECONDS, smoke_env)
        smoke_report = json.loads((SMOKE_DIR/'cuda_verification.json').read_text())
        assert smoke_report.get('status') == 'PASS'
        assert smoke_report.get('actual_gpu_execution_confirmed_by_local_outputs') is True
        assert (SMOKE_DIR/'gpu_preview.png').is_file()
        SMOKE_PASSED = True
        print(json.dumps(smoke_report, ensure_ascii=False, indent=2))
        print(json.dumps(json.loads((SMOKE_DIR/'benchmark_summary.json').read_text()), ensure_ascii=False, indent=2))
        from IPython.display import display, FileLink
        from PIL import Image as PILImage
        with PILImage.open(SMOKE_DIR/'gpu_preview.png') as picture:
            display(picture.copy())
        '''),
        md('''## 5 · 可选：有限高清工作负载

        只有参数单元格中的 `RUN_FULL=True` 才会运行。原项目输出静物 **2048×3072**、建筑和山湖 **3072×2048**、产品 **2048×2560**，可选沙丘 **3072×2048**。
        分辨率均由 CUDA 程序原生采样，不做超分辨率。

        工作负载的每次渲染有时长限制，Notebook 另加整个 `--full` 的总时长限制。
        这些限制只停止当前启动的任务；没有 VM 保活、循环占用 GPU、驱动改写、时钟改写或 runtime 管理行为。'''),
        code('''#@title 明确启用后才运行高清任务
        FULL_EXECUTED = False
        if not RUN_FULL:
            print('RUN_FULL=False：跳过高清任务。smoke 输出仍可在后面导出。')
        else:
            assert SMOKE_PASSED
            full_env = dict(run_env,
                CRF_GPU_OUTPUT=str(FULL_DIR), CRF_GPU_SPP=str(FULL_SPP),
                CRF_GPU_DEPTH=str(FULL_DEPTH), CRF_GPU_BATCH=str(BATCH_SPP),
                CRF_MAX_RENDER_SECONDS=str(PER_RENDER_SECONDS),
                CRF_GPU_INCLUDE_DESERT='1' if INCLUDE_DESERT else '0')
            run_logged(['bash', 'tools/run_gpu_workload.sh', '--full'], 'gpu_full.log', FULL_WALL_SECONDS, full_env)
            FULL_EXECUTED = True
        '''),
        code('''#@title 显示实际生成的高清图片及运行信息
        scene_labels = [('still_life', '午后静物'), ('architecture', '日光建筑'),
                        ('landscape', '山峰与湖面'), ('product', '玻璃与黄铜')]
        if INCLUDE_DESERT:
            scene_labels.append(('desert', '风成沙丘'))
        actual_images = []
        if FULL_EXECUTED:
            for stem, label in scene_labels:
                image_path = FULL_DIR / f'{stem}_cuda.png'
                meta_path = FULL_DIR / f'{stem}_cuda.json'
                assert image_path.is_file() and meta_path.is_file(), f'缺少实际输出: {stem}'
                measured = json.loads(meta_path.read_text())
                assert measured.get('renderer') == 'CRF CUDA software-BVH prototype'
                assert measured.get('invalid_samples') == 0
                with PILImage.open(image_path) as picture:
                    assert picture.size == (measured['width'], measured['height'])
                    preview = picture.copy()
                    preview.thumbnail((1000, 800))
                    print(label, picture.size, '|', measured.get('spp'), 'spp | GPU:', measured.get('gpu_name'))
                    display(preview)
                actual_images.append({'scene':stem, 'file':str(image_path.relative_to(PROJECT)),
                                      'width':measured['width'], 'height':measured['height'],
                                      'spp':measured.get('spp'), 'gpu_name':measured.get('gpu_name'),
                                      'sha256':hashlib.sha256(image_path.read_bytes()).hexdigest()})
            print('显示的是缩小预览；导出 ZIP 内保留原生尺寸 PNG。')
        else:
            print('本次只完成 smoke，没有把它称作高清成图。')
        '''),
        md('''## 6 · 导出真实结果

        ZIP 会包含此次运行的 PNG、日志、设备信息、基准、源码 SHA 和内嵌源码包。
        默认不打包体积较大的 PFM；需要时自行开启 `EXPORT_RAW_PFM`，原始文件始终保留在本次独立目录中。
        最后可用 Colab 文件面板下载 ZIP，或把 `DOWNLOAD_RESULTS=True` 后运行下载单元格。'''),
        code('''#@title 打包此次实际运行结果
        assert SMOKE_PASSED
        keep_suffixes = {'.png', '.json', '.csv', '.txt', '.log'}
        if EXPORT_RAW_PFM:
            keep_suffixes.add('.pfm')
        files_to_export = []
        for folder, label in [(SMOKE_DIR, 'smoke'), (FULL_DIR, 'full'), (LOGS, 'notebook_logs')]:
            if folder.exists():
                for path in sorted(folder.rglob('*')):
                    if path.is_file() and path.suffix.lower() in keep_suffixes:
                        files_to_export.append((path, label+'/'+str(path.relative_to(folder))))
        total_bytes = sum(path.stat().st_size for path, _ in files_to_export)
        if total_bytes > 4*1024**3:
            raise RuntimeError('所选结果超过 4 GiB。请保持 EXPORT_RAW_PFM=False，或在文件面板单独下载原始通道。')
        run_manifest = {
            'created_utc':datetime.now(timezone.utc).isoformat(),
            'source_archive_sha256':SOURCE_SHA256, 'source_snapshot_status':SOURCE_SNAPSHOT_STATUS,
            'notebook_gpu_validated_when_built':False,
            'local_cross_compile_evidence':LOCAL_CUDA_COMPILE_EVIDENCE,
            'actual_gpu_smoke_passed_this_run':SMOKE_PASSED,
            'full_executed_this_run':FULL_EXECUTED, 'full_spp':FULL_SPP if FULL_EXECUTED else None,
            'actual_images':actual_images, 'gpu_inventory_csv':inventory,
            'files':[{'file':name,'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
                     for path,name in files_to_export],
            'external_image_assets':[], 'generative_image_model_used':False,
        }
        RESULT_ZIP = RUN_ROOT / 'CRF_GPU_Actual_Results.zip'
        with zipfile.ZipFile(RESULT_ZIP, 'w', zipfile.ZIP_DEFLATED, compresslevel=4) as result:
            result.writestr('colab_run_manifest.json', json.dumps(run_manifest,ensure_ascii=False,indent=2)+'\\n')
            result.write(SOURCE_ZIP, 'source/'+SOURCE_NAME)
            for path, name in files_to_export:
                result.write(path,name)
        with zipfile.ZipFile(RESULT_ZIP) as result:
            assert result.testzip() is None
        print('结果 ZIP:', RESULT_ZIP)
        print('字节:', RESULT_ZIP.stat().st_size)
        print('SHA-256:', hashlib.sha256(RESULT_ZIP.read_bytes()).hexdigest())
        display(FileLink(str(RESULT_ZIP)))
        '''),
        code('''#@title 可选：Colab 标准下载
        if DOWNLOAD_RESULTS:
            from google.colab import files
            files.download(str(RESULT_ZIP))
        else:
            print('下载未自动启动。可从左侧文件面板下载', RESULT_ZIP.name)
        '''),
        md('''## 检查范围与限制

        Notebook 自身做了格式、单元格语法、内嵌 ZIP 与真实脚本路径检查；CUDA 源码的本机交叉编译证据另见首页及记录。
        本机仍没有可运行的 NVIDIA GPU，因此 GPU 单元格没有执行输出。本机编译通过也不能代替目标运行时的编译和执行。
        只有你运行后的日志和 `cuda_verification.json` 能提供这次 GPU 实测证据。

        - smoke 的能量检查不能替代完整的图形算法审计、CUDA 稳定性测试或 CPU/GPU 多场景误差验证。
        - 几何与材质细节决定写实程度；增加样本数主要减少 Monte Carlo 噪声。
        - GPU 型号、可用额度与驱动兼容性取决于你实际选择的 Colab 运行时。
        - 如果已有运行时没有空闲 GPU / NVCC，或编译失败，应停在对应报错处，不把源码存在当作成功运行。
        - 本文件不含 OAuth、CLI session、浏览器 cookie 或其他凭据；不会自动选择账号或分配云端资源。
        '''),
    ]
    nb=nbf.v4.new_notebook(cells=cells,metadata={
        'kernelspec':{'display_name':'Python 3','language':'python','name':'python3'},
        'language_info':{'name':'python','version':'3.12'},
        'colab':{'name':output.name,'provenance':[]},
        'crf':{'source_zip':source.name,'source_sha256':digest,'source_bytes':len(raw),
               'snapshot_status':status,'current_source_differences':changed,'built_at_asia_shanghai':timestamp,
               'local_cuda_compile_evidence':evidence,
               'gpu_executed_during_build':False,'full_render_default':False},
    })
    nbf.validate(nb)
    for index,cell in enumerate(nb.cells):
        if cell.cell_type=='code':compile(ast.parse(cell.source),f'notebook-cell-{index}','exec')
    output.parent.mkdir(parents=True,exist_ok=True)
    nbf.write(nb,output)
    reread=nbf.read(output,as_version=4);nbf.validate(reread)
    manifest={'notebook':str(output.relative_to(ROOT) if output.is_relative_to(ROOT) else output),
              'notebook_bytes':output.stat().st_size,'notebook_sha256':sha(output.read_bytes()),
              'source_zip':str(source),'source_zip_sha256':digest,'snapshot_status':status,
              'current_source_differences':changed,'cells':len(nb.cells),
              'code_cells_syntax_valid':True,'notebook_format_valid':True,'embedded_zip_crc_valid':True,
              'source_paths_checked':REQUIRED,'gpu_cells_executed':False,
              'local_cuda_compile_evidence':evidence,
              'execution_gap':'Local cross-compilation evidence is reported separately. No NVIDIA GPU execution occurred in this notebook build; remote compiler/driver compatibility, CUDA execution and GPU images must be validated in the user-selected runtime.',
              'created_asia_shanghai':timestamp}
    report=output.with_suffix('.build.json');report.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(manifest,ensure_ascii=False,indent=2))
    return output


def main():
    a=argparse.ArgumentParser(description=__doc__)
    a.add_argument('--source-zip',type=Path,default=ROOT/'delivery/CRF_CodeNative_Render_Source.zip')
    a.add_argument('--output',type=Path,default=ROOT/'delivery/CRF_GPU_Colab.ipynb')
    a.add_argument('--snapshot-status',choices=('preliminary','refreshed'),default='preliminary')
    v=a.parse_args();build(v.source_zip.resolve(),v.output.resolve(),v.snapshot_status)


if __name__=='__main__':main()
