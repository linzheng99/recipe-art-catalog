#!/usr/bin/env python3
"""制作待审核预览；人工看图后显式发布，未审核原稿不进入运行索引。"""
from pathlib import Path
import argparse
import hashlib
import json
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
QUEUE = ROOT / 'sources/prompts/HOWTOCOOK_FOOD_REMAINDER.json'
CONFIG = ROOT / 'catalog/illustrations.json'


def read(path):
    return json.loads(path.read_text())


def write(path, data):
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    temporary.replace(path)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def queue_with_checkpoints():
    queue = read(QUEUE)
    for artwork in queue['artworks']:
        checkpoint = ROOT / 'sources/prompts/food-artwork-checkpoints' / (artwork['key'] + '.json')
        if artwork['status'] == 'pending' and checkpoint.exists():
            artwork.update(read(checkpoint))
    return queue


def make_sheet(arguments):
    queue = queue_with_checkpoints()
    if arguments.offset < 0:
        raise ValueError('offset必须非负')
    items = [a for a in queue['artworks'] if a['status'] == 'generated'][arguments.offset:arguments.offset + arguments.limit]
    if not items:
        raise ValueError('没有待审核的已生成原稿')
    sheet = Image.new('RGB', (1120, ((len(items) + 3) // 4) * 294), '#fffcf4')
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.truetype(arguments.font, 18)
    entries = []
    for index, artwork in enumerate(items):
        path = ROOT / artwork['original']
        with Image.open(path) as image:
            if image.mode != 'RGBA' or image.getextrema()[3][0] != 0:
                raise ValueError('缺少真正透明背景：' + artwork['name'])
            thumb = image.copy()
            thumb.thumbnail((252, 236), Image.Resampling.LANCZOS)
            x, y = (index % 4) * 280, (index // 4) * 294
            sheet.paste(thumb, (x + (280 - thumb.width) // 2, y), thumb)
            mini = image.copy()
            mini.thumbnail((44, 44), Image.Resampling.LANCZOS)
            sheet.paste(mini, (x + 12, y + 246), mini)
            draw.text((x + 166, y + 266), artwork['name'], font=font, fill='#0c315e', anchor='mm')
        entries.append({'key': artwork['key'], 'name': artwork['name'], 'original_sha256': sha(path)})
    destination = ROOT / 'sources/artwork/reviews'
    destination.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha256(json.dumps(entries, sort_keys=True).encode()).hexdigest()[:12]
    image_path = destination / (digest + '.jpg')
    sheet.save(image_path, quality=88)
    write(image_path.with_suffix('.json'), {'sheet': str(image_path.relative_to(ROOT)), 'items': entries})
    print(image_path)


def publish(arguments):
    review = read(arguments.review)
    queue = queue_with_checkpoints()
    config = read(CONFIG)
    bykey = {a['key']: a for a in queue['artworks']}
    existing = {a['key'] for a in config['artworks']}
    for entry in review['items']:
        artwork = bykey[entry['key']]
        if entry['original_sha256'] != sha(ROOT / artwork['original']):
            raise ValueError('审核后原稿已变化：' + artwork['name'])
        if artwork['status'] not in ('generated', 'approved'):
            raise ValueError('没有已生成原稿：' + artwork['name'])
        if artwork['key'] not in existing:
            config['artworks'].append({'key': artwork['key'], 'name': artwork['name'], 'aliases': [], 'recipe_ids': [artwork['recipe_id']], 'source_file': artwork['original']})
        artwork['status'] = 'approved'
        artwork['review'] = str(arguments.review.resolve().relative_to(ROOT))
    if 'howtocook-remainder' not in config.get('batches', []):
        config.setdefault('batches', []).append('howtocook-remainder')
    write(CONFIG, config)
    write(QUEUE, queue)
    print(f'已登记{len(review["items"])}张审核通过原稿；运行 build.py 后才更新运行资源。')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    sheet = commands.add_parser('sheet')
    sheet.add_argument('--limit', type=int, choices=range(1, 25), default=24)
    sheet.add_argument('--offset', type=int, default=0)
    sheet.add_argument('--font', default='/System/Library/Fonts/Supplemental/Arial Unicode.ttf')
    published = commands.add_parser('publish', help='仅在人工查看sheet后执行；不会自动判定视觉合格')
    published.add_argument('review', type=Path)
    arguments = parser.parse_args()
    (make_sheet if arguments.command == 'sheet' else publish)(arguments)


if __name__ == '__main__':
    main()
