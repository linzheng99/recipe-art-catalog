#!/usr/bin/env python3
"""从固定版本的Markdown稀疏检出复制文字配方并校验Git摘要；不联网或下载照片。"""
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
import argparse
import hashlib
import json

ROOT = Path(__file__).resolve().parents[2]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-repo', type=Path, required=True, help='已有的固定版本Markdown稀疏检出')
    arguments = parser.parse_args()
    catalog = json.loads((ROOT / 'catalog/howtocook.json').read_text())
    destination = ROOT / 'sources/references/howtocook-sources'
    destination.mkdir(parents=True, exist_ok=True)

    def fetch(recipe):
        target = destination / (recipe['id'] + '.md')
        data = (arguments.source_repo / recipe['path']).read_bytes()
        digest = hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
        if digest != recipe['blob_sha']:
            raise ValueError('源文档摘要不一致：' + recipe['name'])
        target.write_bytes(data)
        return recipe['name']

    failures = []
    with ThreadPoolExecutor(max_workers=6) as workers:
        futures = {workers.submit(fetch, recipe): recipe for recipe in catalog['recipes'] if recipe['category'] != 'template'}
        for count, future in enumerate(as_completed(futures), 1):
            try:
                future.result()
            except Exception as error:
                failures.append(str(error))
            if count % 24 == 0:
                print(f'文字配方校验进度：{count}/{len(futures)}', flush=True)
    if failures:
        raise RuntimeError('\n'.join(failures))
    print(f'全部{len(futures)}篇文字配方已归档并通过固定blob SHA校验。')


if __name__ == '__main__':
    main()
