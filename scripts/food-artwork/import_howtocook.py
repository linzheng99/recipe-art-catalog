#!/usr/bin/env python3
"""从GitHub树快照导入全站源目录；只读取文件名及来源，不下载图片或营养数据。"""
from pathlib import Path
import argparse
import hashlib
import json
import re
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[2]
p = argparse.ArgumentParser()
p.add_argument('--tree', type=Path, required=True, help='GitHub git/trees/<ref>?recursive=1 的JSON快照')
a = p.parse_args()
j = json.loads(a.tree.read_text())
if j.get('truncated') or not re.fullmatch('[0-9a-f]{40}', j.get('sha', '')):
    raise SystemExit('树快照不完整或缺少固定提交，不导入')
ref, recipes = j['sha'], []
for x in j['tree']:
    path = x['path']
    if x['type'] != 'blob' or not path.startswith('dishes/') or not path.endswith('.md'):
        continue
    recipes.append({'id': 'howtocook-'+hashlib.sha256(path.encode()).hexdigest()[:12], 'name': Path(path).stem, 'category': path.split('/')[1], 'path': path, 'blob_sha': x['sha'], 'source_url': 'https://github.com/Anduin2017/HowToCook/blob/'+ref+'/'+quote(path, safe='/')})
if not recipes:
    raise SystemExit('源目录为空，不覆盖已有目录')
output = {'schema_version': 1, 'source': 'Anduin2017/HowToCook', 'dashboard_url': 'https://howtocook.aiursoft.com/Dashboard', 'source_commit': ref, 'license': 'Unlicense', 'license_url': 'https://github.com/Anduin2017/HowToCook/blob/'+ref+'/LICENSE', 'recipes': recipes}
(ROOT/'catalog/howtocook.json').write_text(json.dumps(output, ensure_ascii=False, indent=2)+'\n')
print(f'导入 {len(recipes)} 篇，固定提交 {ref}；配图进度由build.py独立生成。')
