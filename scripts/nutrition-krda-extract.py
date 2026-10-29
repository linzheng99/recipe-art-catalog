"""只读提取韩国年度 DB 10.4；用附录食品码连接原表，不用行号充当食品码。"""
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
ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
with zipfile.ZipFile(args.file) as archive:
    strings = ["".join(t.text or "" for t in item.findall("m:t", ns) + item.findall("m:r/m:t", ns)) for item in ET.fromstring(archive.read("xl/sharedStrings.xml"))]
    workbook = ET.fromstring(archive.read("xl/workbook.xml"))
    rels = {item.attrib["Id"]: item.attrib["Target"] for item in ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))}
    sheets = {item.attrib["name"]: "xl/" + rels[item.attrib["{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"]] for item in workbook.find("m:sheets", ns)}

    def rows(name):
        result = []
        for row in ET.fromstring(archive.read(sheets[name])).findall("m:sheetData/m:row", ns):
            cells = {}
            for cell in row.findall("m:c", ns):
                value = cell.find("m:v", ns)
                if value is not None:
                    cells[re.sub(r"\d+$", "", cell.attrib["r"])] = strings[int(value.text)] if cell.attrib.get("t") == "s" else value.text
            result.append({"row_number": int(row.attrib["r"]), "cells": cells})
        return result

    sheet_name = "국가표준식품성분 Database 10.4"
    data = rows(sheet_name)
    by_index = {r["cells"].get("A"): r for r in data[3:]}
    appendix_name = next(name for name in sheets if name.startswith("부록2)"))
    selected = set(filter(None, args.ids.split(",")))
    foods = []
    for item in rows(appendix_name)[1:]:
        info = item["cells"]
        if not info.get("B") or (selected and info["B"] not in selected):
            continue
        row = by_index.get(info.get("A"))
        if not row or row["cells"].get("D") != info.get("C"):
            raise ValueError("食品码、版本索引与原表名称不一致，停止导出")
        foods.append({"food_id": info["B"], "description": info["C"], "english_name": info.get("D"), "scientific_name": info.get("E"), "sheet_name": sheet_name, "row_number": row["row_number"], "header_cells": data[1]["cells"], "header_units": data[2]["cells"], "basis_header": data[0]["cells"].get("D"), "cells": row["cells"], "identity_evidence": {"sheet_name": appendix_name, "row_number": item["row_number"], "cells": info}})
    if selected and selected != {food["food_id"] for food in foods}:
        raise ValueError("指定食品码未全部找到，停止导出")
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(json.dumps({"dataset_sha256": hashlib.sha256(args.file.read_bytes()).hexdigest(), "foods": foods}, ensure_ascii=False, indent=2) + "\n")
print(json.dumps({"foods": len(foods)}))
