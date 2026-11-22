#!/usr/bin/env python3
"""Publish actual CRF model renders and their evidence without inventing scores."""
from pathlib import Path
import hashlib
import json
import shutil
import subprocess
from datetime import datetime, timezone
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
MEDIA = ROOT / 'web/media/v07'
SELECTION = ROOT / 'reports/v07/visual_selection.json'


def read(path):
    return json.loads(path.read_text())


def write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def program_sha(path):
    # Match the renderer's JSON.stringify serialization exactly, including
    # JavaScript number formatting; this is distinct from the pretty file hash.
    return subprocess.check_output(['node', '-e',
        "const fs=require('node:fs'),c=require('node:crypto');process.stdout.write(c.createHash('sha256').update(JSON.stringify(JSON.parse(fs.readFileSync(process.argv[1],'utf8')))).digest('hex'))",
        str(path)], text=True)


def main():
    selection = read(SELECTION)
    MEDIA.mkdir(parents=True, exist_ok=True)
    for path in sorted((ROOT / 'build/v07_live').glob('*')):
        if path.suffix in {'.png', '.json'}:
            shutil.copy2(path, MEDIA / path.name)
    experiments = []
    for item in selection['cases']:
        case_id, chosen = item['id'], item['selectedPhase']
        first = read(ROOT / f'reports/v07/api_{case_id}_initial.json')
        research = first['response'].get('research', {})
        phases = []
        for phase in ['initial', 'refined', 'refined2', 'refined3']:
            record_path = ROOT / f'reports/v07/api_{case_id}_{phase}.json'
            render_path = MEDIA / f'{case_id}_{phase}.json'
            image_path = MEDIA / f'{case_id}_{phase}.png'
            program_path = ROOT / f'web/assets/v07/generated/{case_id}_{phase}.crf.json'
            if not all(p.is_file() for p in [record_path, render_path, image_path, program_path]):
                continue
            record, render = read(record_path), read(render_path)
            if sha(image_path) != render['sha256'] or program_sha(program_path) != render['programSha256']:
                raise ValueError('Render/program hash mismatch: ' + case_id + '_' + phase)
            response = record['response']
            phases.append({
                'phase': phase, 'image': f'media/v07/{case_id}_{phase}.png',
                'program': f'assets/v07/generated/{case_id}_{phase}.crf.json',
                'apiRecord': f'reports/v07/api_{case_id}_{phase}.json',
                'endpoint': record.get('endpoint'), 'httpStatus': record.get('httpStatus'),
                'recordedAt': record.get('recordedAt'), 'elapsedMs': record.get('elapsedMs'),
                'inputImageProvided': record.get('inputImageProvided'),
                'model': response.get('model'), 'ok': response.get('ok'),
                'programFileSha256': sha(program_path),
                'vision': response.get('vision'), 'repair': response.get('repair'),
                'usage': response.get('usage'), 'recovery': record.get('recovery'),
                'render': render,
            })
        if chosen not in [p['phase'] for p in phases]:
            raise ValueError('Selected phase lacks real render: ' + case_id)
        evidence = {
            'schema': 'crf.model_experiment.v0.7', 'id': case_id,
            'prompt': first['prompt'], 'llmGenerated': True,
            'selection': item, 'research': research, 'phases': phases,
            'photorealismTargetPassed': False,
            'externalFlagshipComparisonPerformed': False,
            'notes': ['所有图片来自所附场景程序的执行；未使用原生示例替代模型输出。',
                      '人工提供了基于实际画面的定向反馈；不是全自动质量达标记录。',
                      '初稿恢复标记只代表同一模型候选经表示协议扩展后通过本地校验。']
        }
        write(MEDIA / f'{case_id}_execution.json', evidence)
        experiments.append({
            'id': case_id, 'title': item['title'], 'prompt': first['prompt'],
            'model': first['response'].get('model', 'deepseek-flash'),
            'searched': research.get('searched', False),
            'referenceImagesSubmitted': research.get('referenceImagesSubmitted', 0),
            'initial': {'image': f'media/v07/{case_id}_initial.png',
                        'program': f'assets/v07/generated/{case_id}_initial.crf.json'},
            'refined': {'image': f'media/v07/{case_id}_{chosen}.png',
                        'program': f'assets/v07/generated/{case_id}_{chosen}.crf.json'},
            'selectedPhase': chosen, 'notes': item['notes'],
            'reportUrl': f'media/v07/{case_id}_execution.json',
            'llmGenerated': True, 'photorealismTargetPassed': False,
        })
    manifest = {'schema': 'crf.experiments.v0.7', 'version': '0.7.0',
                'createdAt': datetime.now(timezone.utc).isoformat(),
                'selectionMethod': 'human visual inspection of actual rendered images',
                'experiments': experiments}
    write(ROOT / 'web/assets/v07/experiments.json', manifest)

    regular = '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'
    bold = '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'
    heading = ImageFont.truetype(bold, 30)
    label = ImageFont.truetype(regular, 21)
    small = ImageFont.truetype(regular, 17)
    width, row_height = 1312, 555
    board = Image.new('RGB', (width, 156 + row_height * len(experiments)), '#101714')
    draw = ImageDraw.Draw(board)
    draw.text((16, 16), 'CRF 0.7 · DeepSeek 实际程序渲染对比', font=heading, fill='#eef2e9')
    draw.text((16, 66), '640 × 480 · 24 samples/pixel · 同一冻结执行器 · 未通过照片级质量验收', font=small, fill='#b4c7ba')
    draw.text((16, 108), '初稿', font=label, fill='#edf1e8')
    draw.text((672, 108), '视觉反馈后的选用结果', font=label, fill='#edf1e8')
    for index, experiment in enumerate(experiments):
        y = 156 + index * row_height
        draw.text((16, y), experiment['title'] + ' · ' + experiment['selectedPhase'], font=label, fill='#eef2e9')
        for x, phase in [(16, 'initial'), (672, experiment['selectedPhase'])]:
            frame = Image.open(MEDIA / f"{experiment['id']}_{phase}.png").convert('RGB')
            if frame.size != (640, 480):
                raise ValueError('Comparison requires equal actual render size')
            board.paste(frame, (x, y + 42))
    board_path = MEDIA / 'model_comparison.png'
    board.save(board_path)
    write(MEDIA / 'model_comparison.json', {
        'schema': 'crf.comparison_board.v0.7', 'sourceImagesModified': False,
        'layoutOnly': True, 'sha256': sha(board_path),
        'experiments': [e['id'] for e in experiments],
        'rendererSha256': sha(ROOT / 'web/crf-radiance07.js')})
    print(json.dumps({'experiments': len(experiments), 'mediaFiles': len(list(MEDIA.iterdir())),
                      'board': str(board_path), 'bytes': board_path.stat().st_size}))


if __name__ == '__main__':
    main()
