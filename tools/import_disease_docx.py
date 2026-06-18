# -*- coding: utf-8 -*-
"""Import rare-disease detail pages from a structured Word document.

The expected Word format is the one used by the current disease-detail
materials: each disease block contains labels such as 疾病名称、所属目录批次、
疾病简介、常见症状、建议就诊方向、初诊材料、是否适合 MDT 等.

Recommended workflow:
  python tools/import_disease_docx.py "C:\\path\\疾病详情6.docx" --dry-run
  python tools/import_disease_docx.py "C:\\path\\疾病详情6.docx"
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass
from datetime import date
from io import BytesIO
from pathlib import Path
from typing import Iterable
from zipfile import ZipFile

from docx import Document
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
DISEASES_PATH = ROOT / "data" / "diseases.json"
DETAILS_PATH = ROOT / "data" / "disease-details.json"
SITE_DATA_SCRIPT = ROOT / "tools" / "build_site_data.js"
ASSET_DIR = ROOT / "assets" / "diseases"

TODAY = date.today().isoformat()

LABELS = {
    "疾病名称",
    "所属目录批次",
    "英文名",
    "疾病简介",
    "常见症状",
    "疾病特点",
    "建议就诊方向",
    "初诊材料",
    "是否适合 MDT",
    "疾病分型",
    "可关联临床研究",
    "政策医保提示",
    "患者常见问题（FAQ）",
    "患者常见问题",
    "疾病关键词",
}

SECTION_ALIASES = {
    "患者常见问题": "患者常见问题（FAQ）",
}

CN_DIGITS = {
    "零": 0,
    "一": 1,
    "二": 2,
    "两": 2,
    "三": 3,
    "四": 4,
    "五": 5,
    "六": 6,
    "七": 7,
    "八": 8,
    "九": 9,
}

SLUG_OVERRIDES = {
    "21-羟化酶缺乏症": "21-hydroxylase-deficiency",
    "法布雷病": "fabry-disease",
    "戈谢病": "gaucher-disease",
}


@dataclass
class DiseaseBlock:
    lines: list[str]
    source_index: int


@dataclass
class ParsedDisease:
    block: DiseaseBlock
    disease_id: str | None
    catalog_name: str
    title: str
    directory_batch: str
    english_name: str
    sections: dict[str, list[str]]
    keywords: list[str]
    slug: str
    specialty_group: str
    warning: str | None = None
    image_asset: str | None = None


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data: dict) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def clean_line(text: str) -> str:
    return re.sub(r"\s+", " ", text.replace("\u3000", " ")).strip()


def clean_lines(lines: Iterable[str]) -> list[str]:
    cleaned: list[str] = []
    for line in lines:
        text = clean_line(line)
        if text:
            cleaned.append(text)
    return cleaned


def get_docx_lines(docx_path: Path) -> list[str]:
    doc = Document(str(docx_path))
    return clean_lines(paragraph.text for paragraph in doc.paragraphs)


def split_blocks(lines: list[str]) -> list[DiseaseBlock]:
    starts = [index for index, line in enumerate(lines) if line == "疾病名称"]
    blocks: list[DiseaseBlock] = []
    for position, start in enumerate(starts):
        block_start = max(0, start - 1)
        block_end = starts[position + 1] - 1 if position + 1 < len(starts) else len(lines)
        block_lines = lines[block_start:block_end]
        blocks.append(DiseaseBlock(lines=block_lines, source_index=block_start))
    return blocks


def label_key(label: str) -> str:
    return SECTION_ALIASES.get(label, label)


def section_map(lines: list[str]) -> dict[str, list[str]]:
    positions: list[tuple[int, str]] = []
    for index, line in enumerate(lines):
        if line in LABELS:
            positions.append((index, label_key(line)))

    sections: dict[str, list[str]] = {}
    for item_index, (start, label) in enumerate(positions):
        end = positions[item_index + 1][0] if item_index + 1 < len(positions) else len(lines)
        body = [line for line in lines[start + 1 : end] if line not in LABELS]
        sections[label] = body

    return sections


def first_line(sections: dict[str, list[str]], key: str, fallback: str = "") -> str:
    values = sections.get(key, [])
    return values[0] if values else fallback


def parse_batch_number(directory_batch: str) -> tuple[int | None, int | None]:
    batch: int | None = None
    if "第一批" in directory_batch:
        batch = 1
    elif "第二批" in directory_batch:
        batch = 2

    catalog_no: int | None = None
    match = re.search(r"目录序号第\s*([0-9]+)\s*位", directory_batch)
    if match:
        catalog_no = int(match.group(1))
    else:
        match_cn = re.search(r"目录序号第\s*([一二两三四五六七八九十百零]+)\s*位", directory_batch)
        if match_cn:
            catalog_no = chinese_number(match_cn.group(1))

    return batch, catalog_no


def chinese_number(text: str) -> int | None:
    if text in CN_DIGITS:
        return CN_DIGITS[text]
    if text == "十":
        return 10
    total = 0
    if "百" in text:
        left, right = text.split("百", 1)
        total += (CN_DIGITS.get(left, 1) if left else 1) * 100
        text = right
    if "十" in text:
        left, right = text.split("十", 1)
        total += (CN_DIGITS.get(left, 1) if left else 1) * 10
        if right:
            total += CN_DIGITS.get(right, 0)
        return total
    if text:
        total += CN_DIGITS.get(text, 0)
    return total or None


def normalize_name(text: str) -> str:
    return re.sub(r"[\s,，()（）《》“”\"'：:；;、/\\-]+", "", text).lower()


def display_name(title: str, catalog_name: str) -> str:
    title = clean_line(title or catalog_name)
    if "又称" in title and catalog_name:
        return catalog_name
    return re.split(r"[（(，,]", title)[0].strip() or catalog_name or title


def short_name(english_name: str, title: str) -> str:
    match = re.search(r"[（(]([A-Za-z0-9-]{2,10})[)）]", english_name)
    if match:
        return match.group(1)
    english_base = re.split(r"[（(,\n，]", english_name.strip())[0].strip()
    if english_base:
        return english_base
    return display_name(title, title)


def slugify(text: str, fallback: str) -> str:
    seed = text or fallback
    seed = re.split(r"[（(,\n，]", seed)[0].strip()
    slug = re.sub(r"[^a-z0-9]+", "-", seed.lower()).strip("-")
    if not slug:
        slug = re.sub(r"[^a-z0-9]+", "-", fallback.lower()).strip("-")
    return slug or "disease-detail"


def pick_slug(catalog_name: str, english_name: str, disease_id: str | None) -> str:
    if catalog_name in SLUG_OVERRIDES:
        return SLUG_OVERRIDES[catalog_name]
    fallback = disease_id or catalog_name
    return slugify(english_name, fallback)


def find_catalog_by_name(catalog: dict, name: str) -> dict | None:
    items = catalog.get("items", [])
    normalized = normalize_name(name)
    for item in items:
        if normalize_name(item.get("nameCn", "")) == normalized:
            return item
    for item in items:
        catalog_normalized = normalize_name(item.get("nameCn", ""))
        if normalized and (normalized in catalog_normalized or catalog_normalized in normalized):
            return item
    return None


def catalog_lookup(catalog: dict, sections: dict[str, list[str]], title: str) -> tuple[str | None, str, str | None]:
    items = catalog.get("items", [])
    by_id = {item["id"]: item for item in items}
    directory_batch = first_line(sections, "所属目录批次")
    name = first_line(sections, "疾病名称", display_name(title, title))
    title_name = display_name(title, title)

    name_match = find_catalog_by_name(catalog, name) or find_catalog_by_name(catalog, title_name)

    batch, catalog_no = parse_batch_number(directory_batch)
    number_match: dict | None = None
    if batch and catalog_no:
        disease_id = f"batch{batch}-{catalog_no:03d}"
        number_match = by_id.get(disease_id)

    if name_match and number_match and name_match["id"] != number_match["id"]:
        warning = (
            f"catalog conflict: Word number points to {number_match['id']} {number_match['nameCn']}, "
            f"name matches {name_match['id']} {name_match['nameCn']}"
        )
        return name_match["id"], name_match["nameCn"], warning

    if name_match:
        return name_match["id"], name_match["nameCn"], None

    if number_match:
        return number_match["id"], number_match["nameCn"], None

    return None, name or title_name, None


def current_catalog_item(catalog: dict, disease_id: str | None) -> dict | None:
    if not disease_id:
        return None
    return next((item for item in catalog.get("items", []) if item.get("id") == disease_id), None)


def specialty_guess(name: str, english_name: str, existing: str | None = None) -> str:
    if existing and existing not in {"待中心分组", "待确认"}:
        return existing
    text = f"{name} {english_name}"
    rules = [
        ("血液与骨髓衰竭", ["贫血", "血小板", "骨髓", "Fanconi", "Diamond", "血友"]),
        ("神经肌肉病", ["肌", "脊髓", "神经", "舞蹈", "SMA", "Myotonia"]),
        ("心血管罕见病", ["心", "冠状", "动脉", "Cardiac", "Coronary"]),
        ("遗传代谢病", ["代谢", "半乳糖", "糖原", "肉碱", "酶", "Fabry", "Gaucher", "Galactosemia"]),
        ("风湿免疫与自身炎症病", ["免疫", "炎", "地中海热", "血管性水肿", "Familial Mediterranean"]),
        ("骨骼与结缔组织病", ["骨", "脊柱", "软骨", "结缔组织", "Scoliosis"]),
        ("肾脏与遗传病", ["肾", "Alport", "Gitelman"]),
        ("罕见肿瘤与组织细胞病", ["肿瘤", "组织细胞", "Erdheim", "Castleman"]),
    ]
    for group, keywords in rules:
        if any(keyword in text for keyword in keywords):
            return group
    return "待中心分组"


def strip_leading_marker(text: str) -> str:
    return re.sub(r"^[✓✔•·\-–—●○]+\s*", "", text).strip()


def split_keywords(lines: list[str]) -> list[str]:
    if not lines:
        return []
    joined = " ".join(lines)
    parts = re.split(r"[|｜、,，;；\s]+", joined)
    return [part.strip() for part in parts if part.strip()]


def is_heading(line: str) -> bool:
    if not line or len(line) > 30:
        return False
    if re.search(r"[。；;！？?]$", line):
        return False
    if line.endswith(("：", ":")):
        return True
    return bool(re.match(r"^[\u4e00-\u9fa5A-Za-z0-9（）() -]{2,30}$", line))


def group_section(lines: list[str], default_title: str) -> list[dict]:
    lines = [strip_leading_marker(line) for line in lines if strip_leading_marker(line)]
    if not lines:
        return []

    groups: list[dict] = []
    current_title = default_title
    current_items: list[str] = []

    for index, line in enumerate(lines):
        next_line = lines[index + 1] if index + 1 < len(lines) else ""
        heading = is_heading(line) and (index == 0 or bool(current_items)) and bool(next_line)
        if heading:
            if current_items:
                groups.append({"title": current_title, "items": current_items})
            current_title = line.rstrip("：:")
            current_items = []
        else:
            current_items.append(line.rstrip("：:"))

    if current_items:
        groups.append({"title": current_title, "items": current_items})

    if not groups:
        groups.append({"title": default_title, "items": lines})
    return groups


def sentence_blocks(lines: list[str]) -> list[str]:
    if not lines:
        return []
    blocks: list[str] = []
    buffer: list[str] = []
    for line in lines:
        if len("".join(buffer)) > 80 and re.search(r"[。！？?.!]$", buffer[-1]):
            blocks.append("".join(buffer))
            buffer = []
        buffer.append(line)
    if buffer:
        blocks.append("".join(buffer))
    return blocks


def parse_visit(lines: list[str]) -> dict:
    primary: list[str] = []
    related: list[str] = []
    target = primary
    for line in lines:
        if line == "首选科室":
            target = primary
            continue
        if line == "相关科室":
            target = related
            continue
        if line.endswith(("：", ":")):
            continue
        target.append(strip_leading_marker(line))
    return {
        "primary": [item for item in primary if item],
        "related": [item for item in related if item],
    }


def parse_mdt(lines: list[str]) -> dict:
    grouped = group_section(lines, "MDT 适用情况")
    suitable = " ".join(lines[:2]) if lines else "需结合病情、资料完整性与专科医生评估。"
    teams: list[str] = []
    for line in lines:
        if "MDT" in line or "团队" in line or "专科" in line:
            teams.append(strip_leading_marker(line))
    return {
        "suitable": suitable,
        "teams": teams[:8],
        "notes": grouped,
    }


def parse_faq(block_lines: list[str], sections: dict[str, list[str]]) -> list[dict]:
    keyword_index = next((i for i, line in enumerate(block_lines) if line == "疾病关键词"), len(block_lines))
    faq_label_index = next((i for i, line in enumerate(block_lines) if line in {"患者常见问题（FAQ）", "患者常见问题"}), None)

    if faq_label_index is None:
        policy_index = next((i for i, line in enumerate(block_lines) if line == "政策医保提示"), 0)
        first_question = next(
            (i for i in range(policy_index + 1, keyword_index) if re.match(r"^\d+[\.．]\s*(.+)$", block_lines[i])),
            None,
        )
        if first_question is None:
            return []
        start = first_question
    else:
        start = faq_label_index + 1

    lines = block_lines[start:keyword_index]
    faqs: list[dict] = []
    current_question: str | None = None
    answer: list[str] = []

    for line in lines:
        match = re.match(r"^\d+[\.．]\s*(.+)$", line)
        if match:
            if current_question:
                faqs.append({"question": current_question, "answer": "".join(answer).strip()})
            current_question = match.group(1).strip()
            answer = []
        elif current_question:
            answer.append(line)

    if current_question:
        faqs.append({"question": current_question, "answer": "".join(answer).strip()})

    return [faq for faq in faqs if faq["question"]]


def trim_policy(lines: list[str]) -> list[str]:
    trimmed: list[str] = []
    for line in lines:
        if re.match(r"^\d+[\.．]\s*(.+)$", line):
            break
        trimmed.append(line)
    return trimmed


def parse_diseases(docx_path: Path, catalog: dict) -> list[ParsedDisease]:
    lines = get_docx_lines(docx_path)
    blocks = split_blocks(lines)
    parsed: list[ParsedDisease] = []

    for block in blocks:
        sections = section_map(block.lines)
        title = block.lines[0] if block.lines else first_line(sections, "疾病名称")
        disease_id, catalog_name, warning = catalog_lookup(catalog, sections, title)
        directory_batch = first_line(sections, "所属目录批次")
        english_lines = sections.get("英文名", [])
        english_name = "\n".join(english_lines)
        item = current_catalog_item(catalog, disease_id)
        existing_group = item.get("specialtyGroup") if item else None
        parsed.append(
            ParsedDisease(
                block=block,
                disease_id=disease_id,
                catalog_name=catalog_name,
                title=title,
                directory_batch=directory_batch,
                english_name=english_name,
                sections=sections,
                keywords=split_keywords(sections.get("疾病关键词", [])),
                slug=pick_slug(catalog_name, english_name, disease_id),
                specialty_group=specialty_guess(catalog_name, english_name, existing_group),
                warning=warning,
            )
        )

    return parsed


def natural_media_key(path: str) -> tuple[int, str]:
    match = re.search(r"image(\d+)", path)
    return (int(match.group(1)) if match else 9999, path)


def extract_images(docx_path: Path) -> list[bytes]:
    images: list[bytes] = []
    with ZipFile(docx_path) as archive:
        media_names = sorted(
            [name for name in archive.namelist() if name.startswith("word/media/")],
            key=natural_media_key,
        )
        for name in media_names:
            images.append(archive.read(name))
    return images


def save_image(image_bytes: bytes, slug: str) -> str:
    ASSET_DIR.mkdir(parents=True, exist_ok=True)
    target = ASSET_DIR / f"{slug}-infographic.jpg"
    with Image.open(BytesIO(image_bytes)) as image:
        image.load()
        if image.mode in {"RGBA", "LA"}:
            background = Image.new("RGB", image.size, (255, 255, 255))
            alpha = image.getchannel("A") if "A" in image.getbands() else None
            background.paste(image.convert("RGBA"), mask=alpha)
            image = background
        else:
            image = image.convert("RGB")
        image.thumbnail((1800, 1200))
        image.save(target, "JPEG", quality=86, optimize=True)
    return str(target.relative_to(ROOT)).replace("\\", "/")


def build_detail_item(parsed: ParsedDisease) -> dict:
    title = parsed.title
    catalog_name = parsed.catalog_name
    display = display_name(title, catalog_name)
    summary = sentence_blocks(parsed.sections.get("疾病简介", []))
    policy_lines = trim_policy(parsed.sections.get("政策医保提示", []))

    return {
        "id": parsed.slug,
        "diseaseId": parsed.disease_id,
        "title": title,
        "displayName": display,
        "catalogName": catalog_name,
        "directoryBatch": parsed.directory_batch,
        "englishName": parsed.english_name,
        "shortName": short_name(parsed.english_name, title),
        "specialtyGroup": parsed.specialty_group,
        "heroImage": parsed.image_asset or "",
        "heroImageAlt": f"{display}科普图解",
        "summary": summary,
        "symptoms": group_section(parsed.sections.get("常见症状", []), "常见症状"),
        "features": group_section(parsed.sections.get("疾病特点", []), "疾病特点"),
        "visit": parse_visit(parsed.sections.get("建议就诊方向", [])),
        "materialsIntro": "建议患者首次就诊时准备以下资料。",
        "materials": group_section(parsed.sections.get("初诊材料", []), "初诊材料"),
        "mdt": parse_mdt(parsed.sections.get("是否适合 MDT", [])),
        "classification": group_section(parsed.sections.get("疾病分型", []), "疾病分型"),
        "research": group_section(parsed.sections.get("可关联临床研究", []), "可关联临床研究"),
        "policy": group_section(policy_lines, "政策医保提示"),
        "faq": parse_faq(parsed.block.lines, parsed.sections),
        "keywords": parsed.keywords,
    }


def apply_catalog_updates(catalog: dict, parsed: list[ParsedDisease]) -> None:
    updates = {
        item.disease_id: {
            "specialtyGroup": item.specialty_group,
            "reviewStatus": "已有详情，待中心专家医学审核",
        }
        for item in parsed
        if item.disease_id
    }
    if not updates:
        return

    text = DISEASES_PATH.read_text(encoding="utf-8")
    for disease_id, values in updates.items():
        pattern = re.compile(
            rf'(\{{ "id": "{re.escape(disease_id)}", "batch": \d+, "catalogNo": \d+, '
            rf'"nameCn": "[^"]+", "nameEn": "[^"]*", "specialtyGroup": ")[^"]*'
            rf'(", "reviewStatus": ")[^"]*(" \}})'
        )
        text, count = pattern.subn(
            rf'\1{values["specialtyGroup"]}\2{values["reviewStatus"]}\3',
            text,
            count=1,
        )
        if count == 0:
            raise RuntimeError(f"Cannot update data/diseases.json line for {disease_id}; file format changed.")
    DISEASES_PATH.write_text(text, encoding="utf-8")


def update_details(docx_path: Path, parsed: list[ParsedDisease]) -> None:
    details = load_json(DETAILS_PATH)
    existing_items = details.get("items", [])
    replacement_ids = {item.disease_id for item in parsed if item.disease_id}
    new_items = [item for item in existing_items if item.get("diseaseId") not in replacement_ids]
    new_items.extend(build_detail_item(item) for item in parsed)

    def order_key(item: dict) -> tuple[int, int, str]:
        match = re.match(r"batch(\d+)-(\d+)", str(item.get("diseaseId") or ""))
        if match:
            return int(match.group(1)), int(match.group(2)), item.get("id", "")
        return 99, 999, item.get("id", "")

    details["items"] = sorted(new_items, key=order_key)
    details.setdefault("metadata", {})
    details["metadata"]["updatedAt"] = TODAY
    source = details["metadata"].get("source", "")
    source_parts = [part.strip() for part in re.split(r"[;；]", source) if part.strip()]
    if docx_path.name not in source_parts:
        source_parts.append(docx_path.name)
    details["metadata"]["source"] = "；".join(source_parts)
    write_json(DETAILS_PATH, details)


def find_node(explicit_node: str | None = None) -> str:
    if explicit_node:
        return explicit_node
    found = shutil.which("node")
    if found:
        return found
    bundled = Path.home() / ".cache" / "codex-runtimes" / "codex-primary-runtime" / "dependencies" / "node" / "bin" / "node.exe"
    if bundled.exists():
        return str(bundled)
    return "node"


def rebuild_site_data(node: str) -> None:
    subprocess.run([node, str(SITE_DATA_SCRIPT)], cwd=ROOT, check=True)


def print_summary(parsed: list[ParsedDisease], image_count: int, dry_run: bool) -> None:
    print(f"mode={'dry-run' if dry_run else 'write'}")
    print(f"diseaseBlocks={len(parsed)}")
    print(f"docxImages={image_count}")
    if image_count != len(parsed):
        print(f"warning=image count ({image_count}) does not match disease block count ({len(parsed)}). Images are mapped by document order.")
    for index, item in enumerate(parsed, start=1):
        status = item.disease_id or "UNMATCHED"
        print(f"{index:02d}. {status} | {item.catalog_name} | slug={item.slug} | group={item.specialty_group}")
        if item.warning:
            print(f"    warning={item.warning}")
    unmatched = [item.catalog_name for item in parsed if not item.disease_id]
    if unmatched:
        print("unmatched=" + "；".join(unmatched))


def main() -> int:
    parser = argparse.ArgumentParser(description="Import structured disease detail pages from a .docx file.")
    parser.add_argument("docx", type=Path, help="Path to the source .docx file")
    parser.add_argument("--dry-run", action="store_true", help="Parse and report only; do not write files")
    parser.add_argument("--no-build", action="store_true", help="Do not rebuild data/site-data.js after writing")
    parser.add_argument("--node", help="Path to node executable for rebuilding site data")
    args = parser.parse_args()

    docx_path = args.docx.expanduser().resolve()
    if not docx_path.exists():
        raise FileNotFoundError(docx_path)
    if docx_path.suffix.lower() != ".docx":
        raise ValueError("Only .docx files are supported.")

    catalog = load_json(DISEASES_PATH)
    parsed = parse_diseases(docx_path, catalog)
    images = extract_images(docx_path)

    for item, image_bytes in zip(parsed, images):
        item.image_asset = f"assets/diseases/{item.slug}-infographic.jpg"
        if not args.dry_run:
            item.image_asset = save_image(image_bytes, item.slug)

    print_summary(parsed, len(images), args.dry_run)

    if args.dry_run:
        return 0

    if any(not item.disease_id for item in parsed):
        raise RuntimeError("Import stopped because one or more diseases could not be matched to the official catalog.")

    update_details(docx_path, parsed)
    apply_catalog_updates(catalog, parsed)
    if not args.no_build:
        rebuild_site_data(find_node(args.node))
    print("updated=data/disease-details.json,data/diseases.json,data/site-data.js")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"error={exc}", file=sys.stderr)
        raise
