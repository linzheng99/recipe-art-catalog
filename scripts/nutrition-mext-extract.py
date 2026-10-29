"""只读提取官方 XLSX 的原始单元格，不计算或改写成分数值。"""
import argparse
import hashlib
import json
import re
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("file", type=Path)
parser.add_argument("--ids", default="")
parser.add_argument("--output", required=True, type=Path)
args = parser.parse_args()
namespace = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
with zipfile.ZipFile(args.file) as archive:
    shared = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    # 不混入 Excel 的日文读音注释 rPh，保留食品名的原始正文。
    strings = ["".join(t.text or "" for t in list(item.findall("m:t", namespace)) + list(item.findall("m:r/m:t", namespace))) for item in shared]
    workbook = ET.fromstring(archive.read("xl/workbook.xml"))
    sheet_name = workbook.find("m:sheets/m:sheet", namespace).attrib["name"]
    sheet = ET.fromstring(archive.read("xl/worksheets/sheet1.xml"))
    rows = []
    for row in sheet.findall(".//m:sheetData/m:row", namespace):
        cells = {}
        for cell in row.findall("m:c", namespace):
            value = cell.find("m:v", namespace)
            if value is not None:
                cells[re.sub(r"\d+$", "", cell.attrib["r"])] = strings[int(value.text)] if cell.attrib.get("t") == "s" else value.text
        rows.append({"row_number": int(row.attrib["r"]), "cells": cells})
    identifiers = next(row["cells"] for row in rows if row["cells"].get("G") == "ENERC_KCAL")
    selected = set(filter(None, args.ids.split(",")))
    foods = [{"food_id": row["cells"]["B"], "description": row["cells"]["D"], "row_number": row["row_number"], "sheet_name": sheet_name, "header_cells": identifiers, "header_units": next(item["cells"] for item in rows if item["row_number"] == 11), "basis_header": next(item["cells"].get("D") for item in rows if item["row_number"] == 2), "cells": row["cells"]} for row in rows if re.fullmatch(r"\d{5}", row["cells"].get("B", "")) and (not selected or row["cells"]["B"] in selected)]
    if selected and selected != {food["food_id"] for food in foods}:
        raise ValueError("指定食品编号不存在，未导出不完整数据")
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(json.dumps({"dataset_sha256": hashlib.sha256(args.file.read_bytes()).hexdigest(), "foods": foods}, ensure_ascii=False, indent=2) + "\n")
print(json.dumps({"foods": len(foods), "output": str(args.output)}))
