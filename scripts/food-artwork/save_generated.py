#!/usr/bin/env python3
"""保存内置生图结果及独立检查点，仅向工具返回128px预览，避免原图回传超限。"""
from pathlib import Path
import base64
import hashlib
import io
import json
import shutil
import sys
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]


def main():
    key, source = sys.argv[1:]
    queue = json.loads((ROOT / 'sources/prompts/HOWTOCOOK_FOOD_REMAINDER.json').read_text())
    artwork = next(a for a in queue['artworks'] if a['key'] == key)
    target = (ROOT / artwork['original']).resolve()
    if not target.is_relative_to(ROOT):
        raise ValueError('原稿必须保存在项目内')
    target.parent.mkdir(parents=True, exist_ok=True)
    source = Path(source)
    if target.exists():
        if hashlib.sha256(target.read_bytes()).digest() != hashlib.sha256(source.read_bytes()).digest():
            raise ValueError('不得覆盖既有原稿：' + key)
    else:
        shutil.copyfile(source, target)
    with Image.open(target) as image:
        preview = image.convert('RGBA')
        preview.thumbnail((128, 128), Image.Resampling.LANCZOS)
        stream = io.BytesIO()
        preview.save(stream, format='PNG', optimize=True)
    checkpoints = ROOT / 'sources/prompts/food-artwork-checkpoints'
    checkpoints.mkdir(parents=True, exist_ok=True)
    checkpoint = checkpoints / (key + '.json')
    temporary = checkpoint.with_suffix('.tmp')
    temporary.write_text(json.dumps({'key': key, 'status': 'generated', 'generated_source': source.name, 'original': artwork['original']}, ensure_ascii=False) + '\n')
    temporary.replace(checkpoint)
    print(json.dumps({'preview_url': 'data:image/png;base64,' + base64.b64encode(stream.getvalue()).decode(), 'preview_bytes': len(stream.getvalue()), 'original': artwork['original']}))


if __name__ == '__main__':
    main()
