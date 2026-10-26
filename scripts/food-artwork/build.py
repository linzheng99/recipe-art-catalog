#!/usr/bin/env python3
"""将审核过的独立插画生成限尺寸WebP、内容寻址文件和独立目录；不访问网络。"""
from pathlib import Path
import hashlib
import json
import re
import subprocess
import unicodedata
from PIL import Image
from PIL import __version__ as PILLOW_VERSION

ROOT = Path(__file__).resolve().parents[2]
CATALOG = ROOT / 'catalog'
OUTPUT = ROOT / 'public/assets/food-artwork'
BUILD_PROFILE = 'webp-lanczos-q84-64-method6-exact-v1-pillow-' + PILLOW_VERSION


def digest(data):
    return hashlib.sha256(data).hexdigest()


def thumbnail(source, size, limit):
    with Image.open(source) as original:
        image = original.convert('RGBA')
        if image.getextrema()[3][0] == 255:
            raise ValueError(f'需要真正透明背景：{source}')
        image.thumbnail((size, size), Image.Resampling.LANCZOS)
        canvas = Image.new('RGBA', (size, size))
        canvas.alpha_composite(image, ((size-image.width)//2, (size-image.height)//2))
        import io
        for quality in (84, 80, 76, 72, 68, 64):
            stream = io.BytesIO()
            canvas.save(stream, 'WEBP', quality=quality, method=6, exact=True)
            data = stream.getvalue()
            if len(data) <= limit:
                return data
        raise ValueError(f'{source.name} {size}px 超出 {limit} 字节预算；请先简化插画')


def normalize(name):
    return ''.join(unicodedata.normalize('NFKC', name).split())


def cached_variants(previous, original_sha):
    """只复用原稿、生成规范和实际文件均未变化的衍生图，避免每批重压全站。"""
    if not previous or previous.get('original_sha256') != original_sha:
        return None
    variants = previous.get('variants', {})
    for size, budget in ((256, 24*1024), (512, 64*1024)):
        variant = variants.get(str(size), {})
        filename = Path(variant.get('path', '')).name
        target = OUTPUT / filename
        if not filename or not target.is_file():
            return None
        data = target.read_bytes()
        sha = digest(data)
        if len(data) > budget or len(data) != variant.get('bytes') or sha != variant.get('sha256') or f'.{sha[:16]}.{size}.webp' not in filename:
            return None
        with Image.open(target) as image:
            if image.format != 'WEBP' or image.size != (size, size) or image.convert('RGBA').getextrema()[3][0] == 255:
                return None
    return variants


def main():
    source = json.loads((CATALOG/'howtocook.json').read_text())
    config = json.loads((CATALOG/'illustrations.json').read_text())
    recipes = {r['id']: r for r in source['recipes']}
    OUTPUT.mkdir(parents=True, exist_ok=True)
    manifest_file = CATALOG / 'variants.json'
    prior = json.loads(manifest_file.read_text()) if manifest_file.exists() else {}
    previous = {a['key']: a for a in prior.get('artworks', [])} if prior.get('build_profile') == BUILD_PROFILE else {}
    manifest, used, ready_recipes = [], set(), set()
    for artwork in config['artworks']:
        key = artwork['key']
        if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', key):
            raise ValueError(f'非法key: {key}')
        if not artwork['recipe_ids'] or any(r not in recipes for r in artwork['recipe_ids']):
            raise ValueError(f'未知来源：{key}')
        for name in [artwork['name'], *artwork['aliases']]:
            value = normalize(name)
            if not value or value in used:
                raise ValueError(f'空别名或别名冲突：{name}')
            used.add(value)
        original = (ROOT/artwork['source_file']).resolve()
        if not original.is_relative_to(ROOT) or not original.is_file():
            raise ValueError(f'缺少已审核原图：{artwork["source_file"]}')
        original_sha = digest(original.read_bytes())
        variants = cached_variants(previous.get(key), original_sha)
        if variants is None:
            variants = {}
            for size, budget in ((256, 24*1024), (512, 64*1024)):
                data = thumbnail(original, size, budget)
                sha = digest(data)
                filename = f'{key}.{sha[:16]}.{size}.webp'
                (OUTPUT/filename).write_bytes(data)
                variants[str(size)] = {'path': 'assets/food-artwork/'+filename, 'width': size, 'height': size, 'bytes': len(data), 'sha256': sha}
        manifest.append({k: artwork[k] for k in ('key', 'name', 'aliases', 'recipe_ids')} | {'variants': variants, 'original_sha256': original_sha})
        ready_recipes.update(artwork['recipe_ids'])
    manifest_file.write_text(json.dumps({'build_profile': BUILD_PROFILE, 'artworks': manifest}, ensure_ascii=False, indent=2)+'\n')
    subprocess.run(['node', 'scripts/build.mjs'], cwd=ROOT, check=True)
    print(f'已压缩 {len(manifest)} 道菜；PNG原稿不进入公开站点。')

if __name__ == '__main__':
    main()
